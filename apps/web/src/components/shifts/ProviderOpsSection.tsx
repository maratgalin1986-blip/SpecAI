import { prisma } from '@specai/database';
import { loadMachineIncome } from '@/lib/machineIncomeStore';
import { listOperators, operatorToJson } from '@/lib/operatorStore';
import { MachineCalendar } from './MachineCalendar';
import { MachineIncomeTable } from './MachineIncomeTable';
import { OperatorsSection } from './OperatorsSection';

// The Yandex Pro-style blocks of /provider in one server component: income
// per machine, the occupancy calendar and the operators. Loads its own data
// so the page itself only mounts it.

export async function ProviderOpsSection({ companyId }: { companyId: string }) {
  const [income, operators, machines] = await Promise.all([
    loadMachineIncome(companyId, prisma),
    listOperators(companyId),
    prisma.equipment.findMany({
      where: { companyId, status: { not: 'RETIRED' } },
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);
  return (
    <>
      <MachineIncomeTable report={income} />
      <MachineCalendar machines={machines} />
      <OperatorsSection initial={operators.map(operatorToJson)} />
    </>
  );
}

/** The company's operators for the booking cards (OperatorSelect). */
export async function loadOperatorOptions(companyId: string) {
  const rows = await listOperators(companyId);
  return rows.map((row) => ({ id: row.id, name: row.name, active: row.active }));
}
