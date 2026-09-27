import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, type Prisma } from '@specai/database';
import {
  streamAssistantReply,
  SEARCH_EQUIPMENT_TOOL_NAME,
  GET_MY_BOOKINGS_TOOL_NAME,
  type AssistantMessage,
  type SearchEquipmentInput,
} from '@specai/ai-service';
import { getRequestUser } from '@/lib/requestUser';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };
const HISTORY_LIMIT = 30;

const chatRequestSchema = z.object({
  conversationId: z.string().cuid().optional(),
  message: z.string().trim().min(1).max(4000),
});

function sseChunk(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function loadOwnedConversation(conversationId: string, userId: string) {
  const conversation = await prisma.aiConversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.userId !== userId) {
    return null;
  }
  return conversation;
}

/**
 * Tool implementations. They live here (not in ai-service) because only the
 * web app has database access and knows who the current user is.
 */
async function searchEquipment(input: SearchEquipmentInput) {
  const { query, category, city, maxDailyRate } = input;
  const where: Prisma.EquipmentWhereInput = {
    status: 'AVAILABLE',
    category: category
      ? {
          OR: [
            { name: { contains: category, mode: 'insensitive' } },
            { slug: { contains: category, mode: 'insensitive' } },
          ],
        }
      : undefined,
    location: city ? { city: { contains: city, mode: 'insensitive' } } : undefined,
    dailyRate: maxDailyRate !== undefined ? { lte: maxDailyRate } : undefined,
    OR: query
      ? [
          { name: { contains: query, mode: 'insensitive' } },
          { make: { contains: query, mode: 'insensitive' } },
          { model: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ]
      : undefined,
  };

  const items = await prisma.equipment.findMany({
    where,
    include: { category: true, location: true },
    orderBy: { dailyRate: 'asc' },
    take: 5,
  });

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    make: item.make,
    model: item.model,
    category: item.category.name,
    city: item.location?.city ?? null,
    dailyRate: Number(item.dailyRate),
    currency: item.currency,
  }));
}

async function getMyBookings(userId: string) {
  const bookings = await prisma.booking.findMany({
    where: { customerId: userId },
    include: { equipment: { select: { id: true, name: true } } },
    orderBy: { startDate: 'desc' },
    take: 20,
  });

  return bookings.map((booking) => ({
    id: booking.id,
    status: booking.status,
    startDate: booking.startDate.toISOString().slice(0, 10),
    endDate: booking.endDate.toISOString().slice(0, 10),
    totalPrice: Number(booking.totalPrice),
    currency: booking.currency,
    depositPaid: booking.depositPaid,
    equipment: booking.equipment,
  }));
}

export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }
  const userId = currentUser.id;

  const rate = checkRateLimit(`ai:chat:${userId}`, RATE_LIMIT);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Слишком много запросов, попробуйте позже' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let conversationId: string;
  if (parsed.data.conversationId) {
    const conversation = await loadOwnedConversation(parsed.data.conversationId, userId);
    if (!conversation) {
      return NextResponse.json({ error: 'Диалог не найден' }, { status: 404 });
    }
    conversationId = conversation.id;
  } else {
    const conversation = await prisma.aiConversation.create({
      data: { userId, purpose: 'GENERAL_SUPPORT' },
    });
    conversationId = conversation.id;
  }

  await prisma.aiMessage.create({
    data: { conversationId, role: 'USER', content: parsed.data.message },
  });

  const stored = await prisma.aiMessage.findMany({
    where: { conversationId, role: { in: ['USER', 'ASSISTANT'] } },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
  });
  const history: AssistantMessage[] = stored
    .reverse()
    .map((m): AssistantMessage => ({
      role: m.role === 'USER' ? 'user' : 'assistant',
      content: m.content,
    }))
    .filter((m) => m.content.trim().length > 0);
  // The API requires the first message to be from the user.
  while (history[0]?.role === 'assistant') {
    history.shift();
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(sseChunk(payload)));

      try {
        const reply = streamAssistantReply({
          history,
          signal: request.signal,
          onToolCall: async (name, input) => {
            if (name === SEARCH_EQUIPMENT_TOOL_NAME) {
              return searchEquipment(input as SearchEquipmentInput);
            }
            if (name === GET_MY_BOOKINGS_TOOL_NAME) {
              return getMyBookings(userId);
            }
            throw new Error(`Unknown tool: ${name}`);
          },
        });

        let step = await reply.next();
        while (!step.done) {
          send({ delta: step.value });
          step = await reply.next();
        }
        const result = step.value;

        if (result.text.trim().length > 0) {
          await prisma.aiMessage.create({
            data: {
              conversationId,
              role: 'ASSISTANT',
              content: result.text,
              metadata: JSON.parse(
                JSON.stringify({ toolCalls: result.toolCalls, stopReason: result.stopReason }),
              ) as Prisma.InputJsonValue,
            },
          });
        }

        send({ done: true, conversationId });
      } catch (error) {
        console.error('[api/ai/chat] stream failed', error);
        send({ error: 'ИИ-ассистент сейчас недоступен', conversationId });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function GET(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const conversationId = request.nextUrl.searchParams.get('conversationId');
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId обязателен' }, { status: 400 });
  }

  const conversation = await loadOwnedConversation(conversationId, currentUser.id);
  if (!conversation) {
    return NextResponse.json({ error: 'Диалог не найден' }, { status: 404 });
  }

  const messages = await prisma.aiMessage.findMany({
    where: { conversationId, role: { in: ['USER', 'ASSISTANT'] } },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return NextResponse.json({ conversationId, messages });
}
