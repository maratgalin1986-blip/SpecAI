'use client';

import { useEffect, useId, useState } from 'react';
import { AS_PERSON } from '@/lib/buyerRequisites';

interface Entity {
  id: string;
  name: string;
  inn: string;
  isDefault: boolean;
}

/**
 * «Заказываю от: <организация> ▾» в форме заявки: по умолчанию — выбранная в
 * «Реквизитах» на главной заказчика, плюс «как частное лицо». Без реквизитов
 * не показывается (заявка — как частное лицо). `onChange(undefined)` — поле не
 * отправляется, сервер берёт выбранное в «Реквизитах».
 */
export function BuyerSelect({ onChange }: { onChange: (value: string | undefined) => void }) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [value, setValue] = useState('');
  const id = useId();

  useEffect(() => {
    let alive = true;
    void fetch('/api/account/legal-entities')
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { entities?: Entity[] } | null) => {
        if (!alive) return;
        const list = body?.entities ?? [];
        setEntities(list);
        const chosen = list.find((entity) => entity.isDefault)?.id ?? AS_PERSON;
        setValue(list.length ? chosen : '');
        onChange(list.length ? chosen : undefined);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (entities.length === 0) return null;
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      Заказываю от
      <select
        id={id}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          onChange(event.target.value);
        }}
        className="rounded-md border border-slate-300 px-3 py-2"
      >
        {entities.map((entity) => (
          <option key={entity.id} value={entity.id}>
            {entity.name} · ИНН {entity.inn}
          </option>
        ))}
        <option value={AS_PERSON}>как частное лицо</option>
      </select>
      <span className="text-xs text-slate-500">
        Реквизиты попадут в заявку; исполнитель увидит их после подтверждения брони — для счёта и
        акта.
      </span>
    </label>
  );
}
