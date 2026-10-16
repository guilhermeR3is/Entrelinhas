import { browser } from 'wxt/browser';
import { tabStatusFromUrl } from '../../tab-status';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Popup root #app not found');

const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
app.textContent = tabStatusFromUrl(tab?.url) === 'active' ? 'Ativa nesta aba' : 'Inativa nesta aba';
