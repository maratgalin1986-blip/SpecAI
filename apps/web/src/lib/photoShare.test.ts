import { describe, expect, it } from 'vitest';
import { photoSubmissionError, photoTelegramText } from './photoShare';

describe('photoSubmissionError', () => {
  it('accepts a client with a note and an executor without one', () => {
    expect(
      photoSubmissionError({ role: 'client', consent: true, note: 'Траншея', fileCount: 2 }),
    ).toBeNull();
    expect(photoSubmissionError({ role: 'executor', consent: true, fileCount: 1 })).toBeNull();
  });
  it('requires consent and at least one, at most three photos', () => {
    expect(photoSubmissionError({ role: 'client', consent: false, fileCount: 1 })).toMatch(
      /согласие/,
    );
    expect(photoSubmissionError({ role: 'client', consent: true, fileCount: 0 })).toMatch(
      /хотя бы/,
    );
    expect(photoSubmissionError({ role: 'client', consent: true, fileCount: 4 })).toMatch(
      /Не больше/,
    );
  });
  it('rejects a comment from an executor', () => {
    expect(
      photoSubmissionError({ role: 'executor', consent: true, note: 'x', fileCount: 1 }),
    ).toMatch(/только фото/);
  });
});

describe('photoTelegramText', () => {
  it('lists the links and keeps executor messages without a comment', () => {
    const text = photoTelegramText({ role: 'executor', consent: true, fileCount: 1 }, [
      'https://a/1.jpg',
    ]);
    expect(text).toContain('исполнитель');
    expect(text).toContain('1. https://a/1.jpg');
    expect(text).not.toContain('Комментарий');
  });
});
