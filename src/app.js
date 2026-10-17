import { loadTasks, saveTasks, loadTheme, saveTheme } from './storage.js';

let tasks = loadTasks();
let theme = loadTheme();

const list = document.querySelector('#tasks');
const form = document.querySelector('#new-task');
const input = document.querySelector('#title');
const count = document.querySelector('#count');
const themeToggle = document.querySelector('#theme-toggle');

function applyTheme() {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = dark ? '☀️' : '🌙';
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.setAttribute('aria-label', 'Dark mode');
  themeToggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}

themeToggle.onclick = () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  saveTheme(theme);
  applyTheme();
};

function render() {
  list.innerHTML = '';
  for (const task of tasks) {
    const li = document.createElement('li');
    li.className = task.done ? 'done' : '';
    li.innerHTML = `<label><input type="checkbox" ${task.done ? 'checked' : ''}> ${task.title}</label>`;
    li.querySelector('input').onchange = () => toggle(task.id);
    list.appendChild(li);
  }
  const left = tasks.filter((t) => !t.done).length;
  count.textContent = `${left} task${left === 1 ? '' : 's'} left`;
}

function toggle(id) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  saveTasks(tasks);
  render();
}

form.onsubmit = (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  tasks.push({ id: Date.now(), title, done: false });
  saveTasks(tasks);
  input.value = '';
  render();
};

document.querySelector('#clear').onclick = () => {
  tasks = tasks.filter((t) => !t.done);
  saveTasks(tasks);
  render();
};

applyTheme();
render();
