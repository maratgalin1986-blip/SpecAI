import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addressProblem,
  domainMailStatus,
  emailProblem,
  resetDomainCache,
  type DnsLike,
} from './mailCheck';

const NOW = new Date('2026-11-18T10:00:00Z');
const notFound = () => Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
const noData = () => Object.assign(new Error('no data'), { code: 'ENODATA' });

function resolver(over: Partial<DnsLike> = {}): DnsLike {
  return {
    resolveMx: async () => [{ exchange: 'mx.firm.ru', priority: 10 }],
    resolve4: async () => {
      throw noData();
    },
    resolve6: async () => {
      throw noData();
    },
    ...over,
  };
}

beforeEach(() => resetDomainCache());

describe('emailProblem — без сети', () => {
  it('нормальные адреса проходят', () => {
    for (const ok of ['info@firma.ru', 'a.b-c_d+tag@mail.ru', 'Office@Firma-Kzn.RU']) {
      expect(emailProblem(ok), ok).toBeNull();
    }
  });

  it('вид, заглушки, служебные имена и опечатки в доменах', () => {
    expect(emailProblem('нет-адреса')).toBe('неверный вид адреса');
    expect(emailProblem('a@@b.ru')).toBe('неверный вид адреса');
    expect(emailProblem('.a@b.ru')).toBe('неверный вид адреса');
    expect(emailProblem('a..b@firma.ru')).toBe('неверный вид адреса');
    expect(emailProblem('a@firma')).toBe('неверный домен');
    expect(emailProblem('a@firma.р')).toBe('неверный домен');
    expect(emailProblem('name@example.com')).toBe('заглушка вместо адреса');
    expect(emailProblem('noreply@firma.ru')).toBe('служебный адрес');
    expect(emailProblem('mailer-daemon@firma.ru')).toBe('служебный адрес');
    expect(emailProblem('ivan@mial.ru')).toBe('опечатка в домене');
    expect(emailProblem('ivan@gmail.con')).toBe('опечатка в домене');
  });
});

describe('domainMailStatus — DNS', () => {
  it('есть MX — домен принимает почту; ответ запоминается', async () => {
    const resolveMx = vi.fn(async () => [{ exchange: 'mx.firm.ru', priority: 10 }]);
    expect(await domainMailStatus('firm.ru', NOW, resolver({ resolveMx }))).toBe('ok');
    expect(await domainMailStatus('FIRM.ru', NOW, resolver({ resolveMx }))).toBe('ok');
    expect(resolveMx).toHaveBeenCalledTimes(1);
  });

  it('MX нет, но есть A — по правилам почты письмо идёт на него', async () => {
    const r = resolver({
      resolveMx: async () => {
        throw noData();
      },
      resolve4: async () => ['1.2.3.4'],
    });
    expect(await domainMailStatus('only-a.ru', NOW, r)).toBe('ok');
  });

  it('домена нет или у него нет ни MX, ни адресов — не принимает почту', async () => {
    const gone = resolver({
      resolveMx: async () => {
        throw notFound();
      },
      resolve4: async () => {
        throw notFound();
      },
      resolve6: async () => {
        throw notFound();
      },
    });
    expect(await domainMailStatus('gone.ru', NOW, gone)).toBe('dead');
    const nullMx = resolver({ resolveMx: async () => [{ exchange: '.', priority: 0 }] });
    expect(await domainMailStatus('nullmx.ru', NOW, nullMx)).toBe('dead');
  });

  it('сбой DNS — «неизвестно»: адрес не отбрасывается и не запоминается', async () => {
    const timeout = Object.assign(new Error('x'), { code: 'ESERVFAIL' });
    const r = resolver({
      resolveMx: async () => {
        throw timeout;
      },
    });
    expect(await domainMailStatus('flaky.ru', NOW, r)).toBe('unknown');
    expect(await addressProblem('a@flaky.ru', NOW, r)).toBeNull();
  });
});

describe('addressProblem', () => {
  it('бесплатные почты по DNS не проверяются; домен без почты — причина', async () => {
    const dead = resolver({
      resolveMx: async () => {
        throw notFound();
      },
      resolve4: async () => {
        throw notFound();
      },
      resolve6: async () => {
        throw notFound();
      },
    });
    expect(await addressProblem('a@mail.ru', NOW, dead)).toBeNull();
    expect(await addressProblem('a@gone-firm.ru', NOW, dead)).toBe(
      'у домена нет почтового сервера',
    );
    resetDomainCache();
    expect(await addressProblem('a@gone-firm.ru', NOW, resolver())).toBeNull();
  });
});
