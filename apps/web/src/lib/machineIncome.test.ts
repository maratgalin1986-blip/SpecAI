import { describe, expect, it } from 'vitest';
import { bookingIncome, incomeByMachine } from './machineIncome';

const now = new Date('2026-10-15T12:00:00Z');
const both = { customerConfirmedAt: now, providerConfirmedAt: now };

describe('bookingIncome', () => {
  it('uses confirmed hours × hourly rate instead of the booking price', () => {
    expect(
      bookingIncome({ totalPrice: '24000', timesheets: [{ hoursWorked: '7.5', ...both }] }, '3000'),
    ).toEqual({ income: 22500, confirmedHours: 7.5 });
  });

  it('keeps the price without a final timesheet or an hourly rate', () => {
    expect(
      bookingIncome(
        { totalPrice: 24000, timesheets: [{ hoursWorked: 9, customerConfirmedAt: now }] },
        3000,
      ),
    ).toEqual({ income: 24000, confirmedHours: 0 });
    expect(
      bookingIncome({ totalPrice: 24000, timesheets: [{ hoursWorked: 9, ...both }] }, null),
    ).toEqual({ income: 24000, confirmedHours: 9 });
  });
});

describe('incomeByMachine', () => {
  const machines = [
    { id: 'm1', name: 'JCB 3CX', hourlyRate: '3000' },
    { id: 'm2', name: 'КамАЗ', hourlyRate: null },
    { id: 'm3', name: 'Автокран', hourlyRate: 4000 },
  ];

  it('sums this month per machine, lists idle machines and sorts by income', () => {
    const report = incomeByMachine(
      machines,
      [
        {
          id: 'b1',
          equipmentId: 'm1',
          status: 'COMPLETED',
          startDate: new Date('2026-10-02T06:00:00Z'),
          totalPrice: '24000',
          timesheets: [
            { hoursWorked: 8, ...both },
            { hoursWorked: 4, customerConfirmedAt: now },
          ],
        },
        {
          id: 'b2',
          equipmentId: 'm1',
          status: 'CONFIRMED',
          startDate: new Date('2026-10-20T06:00:00Z'),
          totalPrice: '10000',
          timesheets: [],
        },
        {
          id: 'b3',
          equipmentId: 'm2',
          status: 'ACTIVE',
          startDate: new Date('2026-10-05T06:00:00Z'),
          totalPrice: 18000,
          timesheets: [{ hoursWorked: 10, ...both }],
        },
        {
          id: 'b4',
          equipmentId: 'm2',
          status: 'PENDING',
          startDate: new Date('2026-10-06T06:00:00Z'),
          totalPrice: 99999,
          timesheets: [],
        },
        {
          id: 'b5',
          equipmentId: 'm3',
          status: 'COMPLETED',
          startDate: new Date('2026-09-29T06:00:00Z'),
          totalPrice: 50000,
          timesheets: [],
        },
        {
          id: 'b6',
          equipmentId: 'unknown',
          status: 'COMPLETED',
          startDate: new Date('2026-10-10T06:00:00Z'),
          totalPrice: 50000,
          timesheets: [],
        },
      ],
      now,
    );
    expect(report.total).toBe(52000);
    expect(report.machines).toEqual([
      { equipmentId: 'm1', name: 'JCB 3CX', income: 34000, bookings: 2, confirmedHours: 8 },
      { equipmentId: 'm2', name: 'КамАЗ', income: 18000, bookings: 1, confirmedHours: 10 },
      { equipmentId: 'm3', name: 'Автокран', income: 0, bookings: 0, confirmedHours: 0 },
    ]);
  });
});
