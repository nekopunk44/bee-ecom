import { mount } from 'svelte';
import '@bee/ui/fonts.css';
import '@bee/ui/tokens.css';
import '@bee/ui/base.css';
import '@bee/ui/cell.css';
import './admin.css';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Admin mount element is missing');
mount(App, { target });
