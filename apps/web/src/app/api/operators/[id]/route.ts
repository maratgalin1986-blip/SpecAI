import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { updateOperatorSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { isProvider } from '@/lib/fleet';
import { INVALID_JSON_MESSAGE, prismaErrorCode, readJson, zodErrorMessage } from '@/lib/apiInput';
import {
  OperatorLoginError,
  operatorSelect,
  operatorToJson,
  setOperatorLogin,
} from '@/lib/operatorStore';

export const dynamic = 'force-dynamic';

/**
 * Edits an operator of the admin's company: name, phone, licence, active
 * (deactivated operators keep their history but get no new bookings and
 * cannot drive shifts), and with `email` + `password` creates or resets the
 * sign-in.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getRequestUser(request);
  if (!isProvider(currentUser)) {
    return NextResponse.json(
      { error: 'Машинистами управляет администратор компании-исполнителя' },
      { status: 403 },
    );
  }
  const body = await readJson(request);
  if (body === null) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const parsed = updateOperatorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const operator = await prisma.operator.findFirst({
    where: { id: params.id, companyId: currentUser.companyId },
  });
  if (!operator) {
    return NextResponse.json({ error: 'Машинист не найден' }, { status: 404 });
  }
  const { name, phone, licenseNumber, active, email, password } = parsed.data;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.operator.update({
        where: { id: operator.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(phone !== undefined ? { phone: phone.trim() || null } : {}),
          ...(licenseNumber !== undefined ? { licenseNumber: licenseNumber.trim() || null } : {}),
          ...(active !== undefined ? { active } : {}),
        },
      });
      if (operator.userId && (name !== undefined || phone !== undefined)) {
        await tx.user.update({
          where: { id: operator.userId },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(phone !== undefined ? { phone: phone.trim() || null } : {}),
          },
        });
      }
      if (email && password) {
        await setOperatorLogin(
          tx,
          { ...operator, name: name ?? operator.name },
          { email, password },
        );
      }
      return tx.operator.findUniqueOrThrow({ where: { id: operator.id }, select: operatorSelect });
    });
    return NextResponse.json({ operator: operatorToJson(updated) });
  } catch (error) {
    if (error instanceof OperatorLoginError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (prismaErrorCode(error) === 'P2002') {
      return NextResponse.json({ error: 'Этот e-mail уже зарегистрирован' }, { status: 409 });
    }
    throw error;
  }
}
