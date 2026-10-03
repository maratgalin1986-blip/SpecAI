// The consent line next to every checkbox that sends personal data: the same
// words and both documents (152-ФЗ: the consent is a separate document,
// /soglasie, and the policy is /privacy). Put it inside the checkbox's <label>.
export function ConsentText({ prefix }: { prefix?: string }) {
  return (
    <span>
      {prefix ? `${prefix} ` : ''}
      Согласен(на) на обработку персональных данных (
      <a href="/soglasie" className="underline" target="_blank">
        согласие
      </a>
      ) в соответствии с{' '}
      <a href="/privacy" className="underline" target="_blank">
        политикой конфиденциальности
      </a>
    </span>
  );
}
