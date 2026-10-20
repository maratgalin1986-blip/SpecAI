import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
vi.mock('@specai/database', () => ({ prisma: { equipmentCategory: { findUnique } } }));

const { categoryIdFromDescription, orderCategoryId } = await import('./orderCategoryData');

describe('categoryIdFromDescription', () => {
  beforeEach(() => findUnique.mockReset());

  it('«Манипулятор вездеход» with «Любая» → the КМУ row', async () => {
    findUnique.mockResolvedValue({ id: 'cat-kmu', children: [] });
    expect(await categoryIdFromDescription('Манипулятор вездеход')).toBe('cat-kmu');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'crane-trucks' } }),
    );
  });

  it('nothing for a text without machinery: no query at all', async () => {
    expect(await categoryIdFromDescription('Нужно помочь на участке')).toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('never a group row, never a missing one', async () => {
    findUnique.mockResolvedValueOnce({ id: 'group', children: [{ id: 'x' }] });
    expect(await categoryIdFromDescription('Нужен самосвал')).toBeUndefined();
    findUnique.mockResolvedValueOnce(null);
    expect(await categoryIdFromDescription('Нужен самосвал')).toBeUndefined();
  });

  it('ignores the provider named in an order from its card', async () => {
    findUnique.mockResolvedValue({ id: 'cat-dump', children: [] });
    await categoryIdFromDescription('Для исполнителя «Кран-Сервис». Нужен самосвал');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'dump-trucks' } }),
    );
  });
});

describe('orderCategoryId', () => {
  beforeEach(() => findUnique.mockReset());

  it('never replaces a type the person chose', async () => {
    expect(
      await orderCategoryId({ categoryId: 'cat-cranes', description: 'Нужен манипулятор' }),
    ).toBe('cat-cranes');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('keeps «Любая» picked by hand open to every provider', async () => {
    expect(
      await orderCategoryId({ anyCategory: true, description: 'Нужен манипулятор или автокран' }),
    ).toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('reads the type from the description when none was chosen', async () => {
    findUnique.mockResolvedValue({ id: 'cat-kmu', children: [] });
    expect(await orderCategoryId({ description: 'Манипулятор вездеход' })).toBe('cat-kmu');
  });
});
