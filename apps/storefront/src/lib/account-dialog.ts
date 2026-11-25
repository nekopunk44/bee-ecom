import { mount } from 'svelte';
import AccountDialog from '../components/AccountDialog.svelte';
import type { Locale } from '../i18n';

type Dialog = { open: (outcome?: string | null) => Promise<void> };
let dialog: Dialog | undefined;

/** Окно аккаунта создаётся один раз, при первом открытии, и дальше переиспользуется. */
export function openAccount(locale: Locale, outcome?: string | null) {
  if (!dialog) {
    const host = document.createElement('div');
    document.body.append(host);
    dialog = mount(AccountDialog, {
      target: host,
      props: { locale },
    }) as unknown as Dialog;
  }
  return dialog.open(outcome);
}
