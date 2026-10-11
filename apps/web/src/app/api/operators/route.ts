import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { createOperatorSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { isProvider } from '@/lib/fleet';
import { INVALID_JSON_MESSAGE, prismaErrorCode, readJson, zodErrorMessage } from '@/lib/apiInput';
import {
  OperatorLoginError,
  listOperators,
  operatorSelect,
  operatorToJson,
  setOperatorLogin,
} from '@/lib/operatorStore';

export const dynamic = 'force-dynamic';

const FORBIDDEN = 'Машинистами управляет администратор компании-исполнителя';

/** The company's operators («машинисты»), active first. Only the company's admin. */
export async function GET(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!isProvider(currentUser)) {
    return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
  }
  const operators = await listOperators(currentUser.companyId);
  return NextResponse.json({ operators: operators.map(operatorToJson) });
}

/**
 * Adds an operator; with `email` + `password` also creates their app sign-in
 * (role PROVIDER_OPERATOR in the admin's company, a temporary password the
 * admin hands over in person — never sent anywhere by the server).
 */
export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!isProvider(currentUser)) {
    return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
  }
  const body = await readJson(request);
  if (body === null) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const parsed = createOperatorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const { name, phone, licenseNumber, email, password } = parsed.data;
  try {
    const operator = await prisma.$transaction(async (tx) => {
      const created = await tx.operator.create({
        data: {
          companyId: currentUser.companyId,
          name,
          phone: phone?.trim() || null,
          licenseNumber: licenseNumber?.trim() || null,
        },
      });
      if (email && password) {
        await setOperatorLogin(tx, created, { email, password });
      }
      return tx.operator.findUniqueOrThrow({ where: { id: created.id }, select: operatorSelect });
    });
    return NextResponse.json({ operator: operatorToJson(operator) }, { status: 201 });
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
