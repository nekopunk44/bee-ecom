/*
 * Вход только окном поверх страницы, отдельной страницы аккаунта нет. Окно загружает
 * и открывает скрипт шапки по событию bee:sign-in, а оно само сообщает о входе и
 * выходе (bee:session, в detail — вошёл ли человек) и о том, что закрылось
 * (bee:account-closed).
 */

/**
 * Открывает окно входа. Обещание сбывается, когда окно закрылось: true, если
 * человек за это время вошёл, иначе false. from — нажатая кнопка: окно вылетает
 * из неё и в неё же возвращается.
 */
export function signIn(from?: Element | null): Promise<boolean> {
  return new Promise((resolve) => {
    let signedIn = false;
    const session = (event: Event) => {
      signedIn = Boolean((event as CustomEvent<boolean>).detail);
    };
    const closed = () => {
      document.removeEventListener('bee:session', session);
      document.removeEventListener('bee:account-closed', closed);
      resolve(signedIn);
    };
    document.addEventListener('bee:session', session);
    document.addEventListener('bee:account-closed', closed);
    document.dispatchEvent(
      new CustomEvent('bee:sign-in', { detail: from ?? null }),
    );
  });
}

/** Человек вошёл или вышел в окне: раздел перечитывает свои данные. */
export function onSession(callback: () => void) {
  document.addEventListener('bee:session', callback);
  return () => document.removeEventListener('bee:session', callback);
}
