const $ = (selector) => document.querySelector(selector);
const taskList = $("#taskList");
const emptyState = $("#emptyState");
const modalBackdrop = $("#taskModal");
const taskForm = $("#taskForm");
const STORAGE_KEY = "codevault.tasks.v1";
let tasks = [];
let currentView = "overview";
let toastTimer;

const dateToday = new Date();
$("#todayLabel").textContent = dateToday.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
$("#datePill").textContent = dateToday.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
$("#greeting").textContent = `${dateToday.getHours() < 12 ? "Good morning" : dateToday.getHours() < 17 ? "Good afternoon" : "Good evening"}. Make today count.`;

function makeId() { return (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`); }
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function loadLocalTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(t => t && typeof t.title === "string" && t.id) : [];
  } catch { return []; }
}
function saveLocalTasks() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
async function loadTasks() {
  // Try the C server API first. If unavailable, keep the app usable with browser storage.
  try {
    const response = await fetch("/api/tasks");
    if (!response.ok) throw new Error("API unavailable");
    const data = await response.json();
    if (Array.isArray(data)) { tasks = data; saveLocalTasks(); return; }
  } catch (_) {}
  tasks = loadLocalTasks();
}
async function persistTasks() {
  saveLocalTasks();
  try {
    await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tasks) });
  } catch (_) { /* Local browser storage is the fallback. */ }
}
function dueText(due) {
  if (!due) return "";
  const dueDate = new Date(`${due}T00:00:00`);
  if (Number.isNaN(dueDate.getTime())) return "";
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((dueDate - today) / 86400000);
  if (diff < 0) return `Overdue · ${dueDate.toLocaleDateString(undefined,{month:"short",day:"numeric"})}`;
  if (diff === 0) return "Due today";
  return `Due ${dueDate.toLocaleDateString(undefined,{month:"short",day:"numeric"})}`;
}
function render() {
  const completed = tasks.filter(t => t.completed).length;
  const remaining = tasks.length - completed;
  const rate = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  $("#totalTasks").textContent = tasks.length;
  $("#completedTasks").textContent = completed;
  $("#inProgressTasks").textContent = remaining;
  $("#completionRate").textContent = `${rate}%`;
  $("#navTaskCount").textContent = remaining;
  $("#donutPercent").textContent = `${rate}%`;
  $("#legendCompleted").textContent = completed;
  $("#legendRemaining").textContent = remaining;
  $("#donutChart").style.background = `conic-gradient(var(--purple) ${rate * 3.6}deg, #edeef4 0deg)`;

  const search = $("#searchInput").value.trim().toLowerCase();
  const status = $("#statusFilter").value;
  let visible = tasks.filter(t => `${t.title} ${t.description || ""}`.toLowerCase().includes(search));
  if (status === "active") visible = visible.filter(t => !t.completed);
  if (status === "completed") visible = visible.filter(t => t.completed);
  if (currentView === "tasks") visible = visible.filter(t => !t.completed);
  visible.sort((a,b) => Number(a.completed) - Number(b.completed) || ({high:0,medium:1,low:2}[a.priority] - {high:0,medium:1,low:2}[b.priority]) || (a.due || "9999").localeCompare(b.due || "9999"));
  $("#taskSectionTitle").textContent = currentView === "tasks" ? "Active tasks" : currentView === "analytics" ? "Task overview" : "Your tasks";
  const shown = currentView === "analytics" ? [] : visible.slice(0, currentView === "overview" ? 6 : visible.length);
  taskList.innerHTML = shown.map(task => {
    const due = dueText(task.due);
    const overdue = due.startsWith("Overdue");
    return `<div class="task-row ${task.completed ? "is-complete" : ""}">
      <input class="task-check" type="checkbox" aria-label="Mark ${escapeHTML(task.title)} complete" data-complete="${escapeHTML(task.id)}" ${task.completed ? "checked" : ""}>
      <div class="task-main"><div class="task-title">${escapeHTML(task.title)}</div>${task.description ? `<div class="task-description">${escapeHTML(task.description)}</div>` : ""}
      <div class="task-meta"><span class="priority ${escapeHTML(task.priority || "medium")}">${escapeHTML((task.priority || "medium").toUpperCase())}</span>${due ? `<span class="due-label ${overdue && !task.completed ? "overdue" : ""}">${escapeHTML(due)}</span>` : ""}</div></div>
      <div class="task-actions"><button class="icon-btn" data-edit="${escapeHTML(task.id)}" aria-label="Edit task">✎</button><button class="icon-btn" data-delete="${escapeHTML(task.id)}" aria-label="Delete task">×</button></div>
    </div>`;
  }).join("");
  const shouldShowEmpty = shown.length === 0;
  emptyState.classList.toggle("show", shouldShowEmpty && currentView !== "analytics");
  if (currentView === "analytics") {
    taskList.innerHTML = `<div class="task-row"><div class="task-main"><div class="task-title">Overall completion rate</div><div class="task-description">${rate}% of tasks completed (${completed} out of ${tasks.length}).</div></div></div>
      <div class="task-row"><div class="task-main"><div class="task-title">High-priority tasks</div><div class="task-description">${tasks.filter(t => t.priority === "high" && !t.completed).length} still active.</div></div></div>
      <div class="task-row"><div class="task-main"><div class="task-title">Overdue tasks</div><div class="task-description">${tasks.filter(t => !t.completed && t.due && t.due < new Date().toISOString().slice(0,10)).length} need attention.</div></div></div>`;
    emptyState.classList.remove("show");
  }
  $("#viewAllBtn").style.display = currentView === "overview" ? "inline-block" : "none";
}
function showToast(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}
function openModal(task = null) {
  taskForm.reset(); $("#formError").textContent = ""; $("#taskId").value = task?.id || "";
  $("#modalTitle").textContent = task ? "Edit task" : "Create a task";
  $("#taskTitle").value = task?.title || ""; $("#taskDescription").value = task?.description || "";
  $("#taskPriority").value = task?.priority || "medium"; $("#taskDue").value = task?.due || "";
  modalBackdrop.classList.add("open"); modalBackdrop.setAttribute("aria-hidden","false"); $("#taskTitle").focus();
}
function closeModal() { modalBackdrop.classList.remove("open"); modalBackdrop.setAttribute("aria-hidden","true"); }
taskForm.addEventListener("submit", async event => {
  event.preventDefault();
  const title = $("#taskTitle").value.trim();
  if (title.length < 3) { $("#formError").textContent = "Please enter a title with at least 3 characters."; return; }
  const id = $("#taskId").value;
  const oldTask = tasks.find(t => t.id === id);
  const task = { id: id || makeId(), title, description: $("#taskDescription").value.trim(), priority: $("#taskPriority").value, due: $("#taskDue").value, completed: oldTask?.completed || false, createdAt: oldTask?.createdAt || new Date().toISOString() };
  if (id) tasks = tasks.map(t => t.id === id ? task : t); else tasks.unshift(task);
  await persistTasks(); closeModal(); render(); showToast(id ? "Task updated" : "Task created");
});
taskList.addEventListener("change", async event => {
  const id = event.target.dataset.complete;
  if (!id) return;
  tasks = tasks.map(t => t.id === id ? {...t, completed: event.target.checked} : t);
  await persistTasks(); render(); showToast(event.target.checked ? "Task completed" : "Task reopened");
});
taskList.addEventListener("click", async event => {
  const editId = event.target.closest("[data-edit]")?.dataset.edit;
  const deleteId = event.target.closest("[data-delete]")?.dataset.delete;
  if (editId) openModal(tasks.find(t => t.id === editId));
  if (deleteId && confirm("Delete this task? This cannot be undone.")) {
    tasks = tasks.filter(t => t.id !== deleteId); await persistTasks(); render(); showToast("Task deleted");
  }
});
$("#openTaskModal").addEventListener("click", () => openModal());
$("#emptyAddBtn").addEventListener("click", () => openModal());
$("#closeModal").addEventListener("click", closeModal);
$("#cancelModal").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", event => { if (event.target === modalBackdrop) closeModal(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });
$("#searchInput").addEventListener("input", render);
$("#statusFilter").addEventListener("change", render);
$("#viewAllBtn").addEventListener("click", () => setView("tasks"));
document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
function setView(view) {
  currentView = view;
  document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  $("#pageTitle").textContent = view === "overview" ? "Overview" : view === "tasks" ? "My Tasks" : "Analytics";
  render();
}
(async function init() {
  await loadTasks();
  if (!tasks.length) {
    tasks = [
      {id:makeId(),title:"Revise data structures and algorithms",description:"Practice arrays, stacks and linked lists.",priority:"high",due:"",completed:false,createdAt:new Date().toISOString()},
      {id:makeId(),title:"Build a portfolio project",description:"Ship one useful feature and document it.",priority:"medium",due:"",completed:false,createdAt:new Date().toISOString()},
      {id:makeId(),title:"Review DBMS notes",description:"Focus on normalization and SQL joins.",priority:"low",due:"",completed:true,createdAt:new Date().toISOString()}
    ];
    await persistTasks();
  }
  render();
})();
