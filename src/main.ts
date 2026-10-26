import { User } from 'firebase/auth';
import {
  logOut,
  onAuthChange,
  registerWithEmail,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
} from './services/auth-service';
import {
  calculateTaskStatistics,
  createTask,
  deleteTask,
  exportTasksAsCSV,
  exportTasksAsJSON,
  subscribeToTasks,
  updateTask,
} from './services/task-service';
import {
  FilterState,
  Task,
  TaskCategory,
  TaskInput,
  TaskPriority,
  TaskStatus,
  ViewMode,
} from './types';
import { modalManager } from './ui/modal';
import { showToast } from './ui/toast';

// -------------------------------------------------------------
// Safe DOM Helper
// -------------------------------------------------------------
const getEl = <T extends HTMLElement = HTMLElement>(id: string): T | null => {
  return document.getElementById(id) as T | null;
};

// -------------------------------------------------------------
// Application State
// -------------------------------------------------------------
let currentUser: User | null = null;
let allTasks: Task[] = [];
let unsubscribeTasksListener: (() => void) | null = null;
let viewMode: ViewMode = 'board';
let editingTaskId: string | null = null;
let taskToDelete: Task | null = null;
let draggedTaskId: string | null = null;
let isRegisterMode = false;

const filterState: FilterState = {
  searchQuery: '',
  status: 'all',
  priority: 'all',
  category: 'all',
  overdueOnly: false,
  sortBy: 'dueDate',
  sortDirection: 'asc',
};

// -------------------------------------------------------------
// Authentication Controller
// -------------------------------------------------------------
function setupAuthListeners(): void {
  const googleSignInBtn = getEl<HTMLButtonElement>('google-signin-btn');
  const authTabLogin = getEl<HTMLButtonElement>('auth-tab-login');
  const authTabRegister = getEl<HTMLButtonElement>('auth-tab-register');
  const registerNameField = getEl('register-name-field');
  const authEmailForm = getEl<HTMLFormElement>('auth-email-form');
  const authName = getEl<HTMLInputElement>('auth-name');
  const authEmail = getEl<HTMLInputElement>('auth-email');
  const authPassword = getEl<HTMLInputElement>('auth-password');
  const authSubmitText = getEl('auth-submit-text');
  const authErrorMsg = getEl('auth-error-msg');
  const forgotPasswordBtn = getEl<HTMLButtonElement>('forgot-password-btn');
  const userMenuBtn = getEl<HTMLButtonElement>('user-menu-btn');
  const userDropdown = getEl('user-dropdown');
  const logoutBtn = getEl('logout-btn');
  const topSignInBtn = getEl('top-signin-btn');
  const brandLogo = getEl('brand-logo');

  // Google sign in button
  googleSignInBtn?.addEventListener('click', async () => {
    try {
      googleSignInBtn.disabled = true;
      googleSignInBtn.classList.add('opacity-70');
      const user = await signInWithGoogle();
      showToast(`Welcome, ${user.displayName || user.email}!`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      googleSignInBtn.disabled = false;
      googleSignInBtn.classList.remove('opacity-70');
    }
  });

  // Switch to Login Tab
  authTabLogin?.addEventListener('click', () => {
    isRegisterMode = false;
    authTabLogin.classList.add('font-semibold', 'text-white', 'border-b-2', 'border-indigo-500');
    authTabLogin.classList.remove('text-slate-400');
    authTabRegister?.classList.remove('font-semibold', 'text-white', 'border-b-2', 'border-indigo-500');
    authTabRegister?.classList.add('text-slate-400');
    registerNameField?.classList.add('hidden');
    if (authSubmitText) authSubmitText.textContent = 'Sign In';
    authErrorMsg?.classList.add('hidden');
  });

  // Switch to Register Tab
  authTabRegister?.addEventListener('click', () => {
    isRegisterMode = true;
    authTabRegister.classList.add('font-semibold', 'text-white', 'border-b-2', 'border-indigo-500');
    authTabRegister.classList.remove('text-slate-400');
    authTabLogin?.classList.remove('font-semibold', 'text-white', 'border-b-2', 'border-indigo-500');
    authTabLogin?.classList.add('text-slate-400');
    registerNameField?.classList.remove('hidden');
    if (authSubmitText) authSubmitText.textContent = 'Create Account';
    authErrorMsg?.classList.add('hidden');
  });

  // Handle Email form submit
  authEmailForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authEmail?.value.trim() || '';
    const password = authPassword?.value || '';
    const name = authName?.value.trim() || '';

    if (!email || !password) {
      displayAuthError('Please fill in both email and password.');
      return;
    }

    try {
      setAuthLoading(true);
      authErrorMsg?.classList.add('hidden');

      if (isRegisterMode) {
        const user = await registerWithEmail(email, password, name || undefined);
        showToast(`Account created! Welcome, ${user.displayName || user.email}!`, 'success');
      } else {
        const user = await signInWithEmail(email, password);
        showToast(`Welcome back, ${user.displayName || user.email}!`, 'success');
      }
      authEmailForm.reset();
    } catch (err: any) {
      displayAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  });

  // Forgot password
  forgotPasswordBtn?.addEventListener('click', async () => {
    const email = authEmail?.value.trim() || '';
    if (!email) {
      displayAuthError('Please enter your email address in the field above to receive a reset link.');
      authEmail?.focus();
      return;
    }
    try {
      await sendPasswordReset(email);
      showToast('Password reset link sent to your email!', 'info');
      authErrorMsg?.classList.add('hidden');
    } catch (err: any) {
      displayAuthError(err.message);
    }
  });

  // User menu dropdown toggle
  userMenuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown?.classList.toggle('hidden');
  });

  window.addEventListener('click', () => {
    if (userDropdown && !userDropdown.classList.contains('hidden')) {
      userDropdown.classList.add('hidden');
    }
    const exportDropdown = getEl('export-dropdown');
    if (exportDropdown && !exportDropdown.classList.contains('hidden')) {
      exportDropdown.classList.add('hidden');
    }
  });

  // Logout button
  logoutBtn?.addEventListener('click', async () => {
    try {
      await logOut();
      showToast('Signed out successfully.', 'info');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  });

  // Top bar Sign In button
  topSignInBtn?.addEventListener('click', () => {
    authEmail?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Brand logo click
  brandLogo?.addEventListener('click', () => {
    filterState.status = 'all';
    filterState.priority = 'all';
    filterState.category = 'all';
    filterState.overdueOnly = false;
    filterState.searchQuery = '';
    const globalSearch = getEl<HTMLInputElement>('global-search-input');
    if (globalSearch) globalSearch.value = '';
    updateSidebarNav();
    updateCategoryNav();
    applyFiltersAndRender();
  });

  // Listen for Firebase Auth state changes
  onAuthChange((user) => {
    currentUser = user;
    const authHero = getEl('auth-hero-view');
    const dashboard = getEl('app-dashboard-view');
    const authSection = getEl('auth-user-section');
    const unauthSection = getEl('unauth-user-section');
    const displayName = getEl('user-display-name');
    const dropdownEmail = getEl('dropdown-user-email');
    const avatar = getEl('user-avatar');
    const loadingState = getEl('tasks-loading-state');

    if (user) {
      // Authenticated state
      authHero?.classList.add('hidden');
      dashboard?.classList.remove('hidden');
      authSection?.classList.remove('hidden');
      unauthSection?.classList.add('hidden');

      const name = user.displayName || user.email?.split('@')[0] || 'User';
      if (displayName) displayName.textContent = name;
      if (dropdownEmail) dropdownEmail.textContent = user.email || '';
      if (avatar) avatar.textContent = name.charAt(0).toUpperCase();

      // Subscribe to real-time Cloud Firestore updates
      loadingState?.classList.remove('hidden');
      if (unsubscribeTasksListener) {
        unsubscribeTasksListener();
      }

      unsubscribeTasksListener = subscribeToTasks(
        user.uid,
        (tasks) => {
          loadingState?.classList.add('hidden');
          allTasks = tasks;
          updateStatistics();
          applyFiltersAndRender();
        },
        (error) => {
          loadingState?.classList.add('hidden');
          showToast(`Firestore synchronization failed: ${error.message}`, 'error');
        }
      );
    } else {
      // Unauthenticated state
      authHero?.classList.remove('hidden');
      dashboard?.classList.add('hidden');
      authSection?.classList.add('hidden');
      unauthSection?.classList.remove('hidden');

      if (unsubscribeTasksListener) {
        unsubscribeTasksListener();
        unsubscribeTasksListener = null;
      }
      allTasks = [];
      updateStatistics();
      renderTasks([]);
    }
  });
}

function displayAuthError(msg: string): void {
  const authErrorMsg = getEl('auth-error-msg');
  if (authErrorMsg) {
    authErrorMsg.textContent = msg;
    authErrorMsg.classList.remove('hidden');
  }
}

function setAuthLoading(loading: boolean): void {
  const authSubmitBtn = getEl<HTMLButtonElement>('auth-submit-btn');
  const authSubmitSpinner = getEl('auth-submit-spinner');
  const authSubmitText = getEl('auth-submit-text');

  if (authSubmitBtn) authSubmitBtn.disabled = loading;
  if (loading) {
    authSubmitSpinner?.classList.remove('hidden');
    authSubmitText?.classList.add('opacity-70');
  } else {
    authSubmitSpinner?.classList.add('hidden');
    authSubmitText?.classList.remove('opacity-70');
  }
}

// -------------------------------------------------------------
// Statistics & Filter Calculation
// -------------------------------------------------------------
function updateStatistics(): void {
  const stats = calculateTaskStatistics(allTasks);

  const statTotal = getEl('stat-total');
  const statTodo = getEl('stat-todo');
  const statInProgress = getEl('stat-in-progress');
  const statCompleted = getEl('stat-completed');
  const statOverdue = getEl('stat-overdue');
  const statRate = getEl('stat-rate');
  const progressCircle = getEl('progress-circle-bar');

  if (statTotal) statTotal.textContent = String(stats.total);
  if (statTodo) statTodo.textContent = String(stats.todo);
  if (statInProgress) statInProgress.textContent = String(stats.inProgress);
  if (statCompleted) statCompleted.textContent = String(stats.completed);
  if (statOverdue) statOverdue.textContent = String(stats.overdue);
  if (statRate) statRate.textContent = `${stats.completionRate}%`;

  // Update animated SVG progress ring
  if (progressCircle) {
    progressCircle.setAttribute('stroke-dasharray', `${stats.completionRate}, 100`);
    if (stats.completionRate >= 80) {
      progressCircle.setAttribute('class', 'text-emerald-400 transition-all duration-500');
    } else if (stats.completionRate >= 40) {
      progressCircle.setAttribute('class', 'text-indigo-400 transition-all duration-500');
    } else {
      progressCircle.setAttribute('class', 'text-amber-400 transition-all duration-500');
    }
  }

  // Update sidebar counter pills
  const countAll = getEl('sidebar-count-all');
  const countTodo = getEl('sidebar-count-todo');
  const countInProg = getEl('sidebar-count-in-progress');
  const countComp = getEl('sidebar-count-completed');
  const countOverdue = getEl('sidebar-count-overdue');

  if (countAll) countAll.textContent = String(stats.total);
  if (countTodo) countTodo.textContent = String(stats.todo);
  if (countInProg) countInProg.textContent = String(stats.inProgress);
  if (countComp) countComp.textContent = String(stats.completed);
  if (countOverdue) countOverdue.textContent = String(stats.overdue);

  // Update category counters in sidebar
  let countWork = 0;
  let countPersonal = 0;
  let countShopping = 0;
  let countStudy = 0;
  let countOther = 0;

  for (const t of allTasks) {
    const cat = t.category || 'work';
    if (cat === 'work') countWork++;
    else if (cat === 'personal') countPersonal++;
    else if (cat === 'shopping') countShopping++;
    else if (cat === 'study') countStudy++;
    else if (cat === 'other') countOther++;
  }

  const catWork = getEl('cat-count-work');
  const catPers = getEl('cat-count-personal');
  const catShop = getEl('cat-count-shopping');
  const catStud = getEl('cat-count-study');
  const catOth = getEl('cat-count-other');

  if (catWork) catWork.textContent = String(countWork);
  if (catPers) catPers.textContent = String(countPersonal);
  if (catShop) catShop.textContent = String(countShopping);
  if (catStud) catStud.textContent = String(countStudy);
  if (catOth) catOth.textContent = String(countOther);
}

function applyFiltersAndRender(): void {
  let filtered = [...allTasks];
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Text Search Filter (title and description)
  if (filterState.searchQuery) {
    const q = filterState.searchQuery.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }

  // 2. Status Filter
  if (filterState.overdueOnly) {
    filtered = filtered.filter((t) => t.status !== 'completed' && t.dueDate && t.dueDate < todayStr);
  } else if (filterState.status !== 'all') {
    filtered = filtered.filter((t) => t.status === filterState.status);
  }

  // 3. Category Filter
  if (filterState.category !== 'all') {
    filtered = filtered.filter((t) => (t.category || 'work') === filterState.category);
  }

  // 4. Priority Filter
  if (filterState.priority !== 'all') {
    filtered = filtered.filter((t) => t.priority === filterState.priority);
  }

  // 5. Sorting
  const priorityWeight: Record<TaskPriority, number> = {
    urgent: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  filtered.sort((a, b) => {
    let comparison = 0;
    if (filterState.sortBy === 'dueDate') {
      comparison = (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
    } else if (filterState.sortBy === 'priority') {
      comparison = priorityWeight[b.priority] - priorityWeight[a.priority];
    } else if (filterState.sortBy === 'title') {
      comparison = a.title.localeCompare(b.title);
    } else if (filterState.sortBy === 'createdAt') {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      comparison = aTime - bTime;
    }
    return filterState.sortDirection === 'asc' ? comparison : -comparison;
  });

  // Update Active Filter Badge text
  updateFilterBadgeText();

  // Render view
  renderTasks(filtered);
}

function updateFilterBadgeText(): void {
  const activeBadge = getEl('active-filter-badge');
  if (!activeBadge) return;

  let text = 'Filter: ';
  if (filterState.overdueOnly) {
    text += 'Overdue Tasks';
  } else if (filterState.status === 'all') {
    text += 'All Workspaces';
  } else {
    text += filterState.status === 'in_progress' ? 'In Progress' : filterState.status.toUpperCase();
  }

  if (filterState.category !== 'all') {
    text += ` • ${filterState.category.toUpperCase()}`;
  }

  if (filterState.priority !== 'all') {
    text += ` • ${filterState.priority.toUpperCase()}`;
  }
  if (filterState.searchQuery) {
    text += ` • "${filterState.searchQuery}"`;
  }
  activeBadge.innerHTML = `<span>${escapeHtml(text)}</span>`;
}

// -------------------------------------------------------------
// View Rendering: Kanban Board & List Views
// -------------------------------------------------------------
function renderTasks(tasks: Task[]): void {
  const kanbanContainer = getEl('kanban-board-container');
  const listContainer = getEl('list-view-container');
  const emptyState = getEl('tasks-empty-state');
  const loadingState = getEl('tasks-loading-state');

  if (viewMode === 'board') {
    kanbanContainer?.classList.remove('hidden');
    listContainer?.classList.add('hidden');
    renderKanbanBoard(tasks);
  } else {
    kanbanContainer?.classList.add('hidden');
    listContainer?.classList.remove('hidden');
    renderListView(tasks);
  }

  // Check if overall empty state should be shown
  if (tasks.length === 0 && loadingState && !loadingState.classList.contains('hidden')) {
    emptyState?.classList.add('hidden');
  } else if (tasks.length === 0) {
    emptyState?.classList.remove('hidden');
    const emptyTitle = getEl('empty-state-title');
    const emptyDesc = getEl('empty-state-desc');
    if (allTasks.length === 0) {
      if (emptyTitle) emptyTitle.textContent = 'No tasks created yet';
      if (emptyDesc) emptyDesc.textContent = 'Get started by creating your first task in Cloud Firestore.';
    } else {
      if (emptyTitle) emptyTitle.textContent = 'No matching tasks found';
      if (emptyDesc) emptyDesc.textContent = 'Try tweaking your category, search term, or priority filter.';
    }
  } else {
    emptyState?.classList.add('hidden');
  }
}

function renderKanbanBoard(filteredTasks: Task[]): void {
  const todoTasks = filteredTasks.filter((t) => t.status === 'todo');
  const inProgressTasks = filteredTasks.filter((t) => t.status === 'in_progress');
  const completedTasks = filteredTasks.filter((t) => t.status === 'completed');

  // Update Column Count Pills
  const colCountTodo = getEl('col-count-todo');
  const colCountInProgress = getEl('col-count-in_progress');
  const colCountCompleted = getEl('col-count-completed');
  if (colCountTodo) colCountTodo.textContent = String(todoTasks.length);
  if (colCountInProgress) colCountInProgress.textContent = String(inProgressTasks.length);
  if (colCountCompleted) colCountCompleted.textContent = String(completedTasks.length);

  // Render cards in columns
  const kanbanTodo = getEl('kanban-cards-todo');
  const kanbanInProg = getEl('kanban-cards-in_progress');
  const kanbanComp = getEl('kanban-cards-completed');

  if (kanbanTodo) {
    kanbanTodo.innerHTML = todoTasks.length
      ? todoTasks.map((t) => createTaskCardHtml(t)).join('')
      : createColumnEmptyHtml('No pending tasks');
  }

  if (kanbanInProg) {
    kanbanInProg.innerHTML = inProgressTasks.length
      ? inProgressTasks.map((t) => createTaskCardHtml(t)).join('')
      : createColumnEmptyHtml('No tasks in progress');
  }

  if (kanbanComp) {
    kanbanComp.innerHTML = completedTasks.length
      ? completedTasks.map((t) => createTaskCardHtml(t)).join('')
      : createColumnEmptyHtml('No completed tasks yet');
  }

  attachCardEventListeners();
}

function renderListView(tasks: Task[]): void {
  const listWrapper = getEl('list-tasks-wrapper');
  if (!listWrapper) return;

  if (tasks.length === 0) {
    listWrapper.innerHTML = '';
    return;
  }

  listWrapper.innerHTML = tasks.map((t) => createListItemHtml(t)).join('');
  attachCardEventListeners();
}

function createColumnEmptyHtml(text: string): string {
  return `
    <div class="h-32 border border-dashed border-slate-800 rounded-xl flex items-center justify-center text-center p-4 text-xs text-slate-400 select-none">
      ${escapeHtml(text)}
    </div>
  `;
}

function createTaskCardHtml(task: Task): string {
  const todayStr = new Date().toISOString().split('T')[0];
  const isOverdue = task.status !== 'completed' && task.dueDate && task.dueDate < todayStr;
  const isCompleted = task.status === 'completed';

  const priorityBadgeClasses: Record<TaskPriority, string> = {
    urgent: 'badge-priority-urgent',
    high: 'badge-priority-high',
    medium: 'badge-priority-medium',
    low: 'badge-priority-low',
  };

  const priorityLabel: Record<TaskPriority, string> = {
    urgent: 'Urgent',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };

  const categoryBadgeClasses: Record<TaskCategory, string> = {
    work: 'badge-category-work',
    personal: 'badge-category-personal',
    shopping: 'badge-category-shopping',
    study: 'badge-category-study',
    other: 'badge-category-other',
  };

  const categoryLabel: Record<TaskCategory, string> = {
    work: 'Work',
    personal: 'Personal',
    shopping: 'Shopping',
    study: 'Study',
    other: 'Other',
  };

  const taskCat: TaskCategory = task.category || 'work';

  return `
    <div
      draggable="true"
      data-task-id="${task.id}"
      class="task-card glass-card rounded-xl p-4 cursor-grab active:cursor-grabbing relative group border transition-all ${
        isCompleted ? 'opacity-85' : ''
      }"
    >
      <!-- Top Row: Priority & Category Badges & Actions -->
      <div class="flex items-center justify-between gap-2 mb-2">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${
            priorityBadgeClasses[task.priority]
          }">
            ${priorityLabel[task.priority]}
          </span>
          <span class="text-[10px] font-medium px-2 py-0.5 rounded-md ${
            categoryBadgeClasses[taskCat]
          }">
            ${categoryLabel[taskCat]}
          </span>
        </div>
        
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button data-action="edit" data-id="${task.id}" type="button" class="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60" title="Edit task">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button data-action="delete" data-id="${task.id}" type="button" class="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10" title="Delete task">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Task Title & Description -->
      <div class="flex items-start gap-2.5 mb-3">
        <button
          data-action="toggle-complete"
          data-id="${task.id}"
          type="button"
          class="mt-0.5 shrink-0 w-4 h-4 rounded border ${
            isCompleted
              ? 'bg-emerald-500 border-emerald-500 text-white flex items-center justify-center'
              : 'border-slate-600 hover:border-slate-400'
          } transition-colors"
          title="${isCompleted ? 'Mark as Incomplete' : 'Mark as Completed'}"
        >
          ${
            isCompleted
              ? `<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" /></svg>`
              : ''
          }
        </button>

        <div class="min-w-0 flex-1">
          <h4 class="text-xs font-semibold text-white leading-snug break-words ${
            isCompleted ? 'line-through text-slate-400' : ''
          }">
            ${escapeHtml(task.title)}
          </h4>
          ${
            task.description
              ? `<p class="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed break-words">${escapeHtml(
                  task.description
                )}</p>`
              : ''
          }
        </div>
      </div>

      <!-- Bottom Metadata Row: Due Date & Quick Status Shift -->
      <div class="flex items-center justify-between text-[11px] pt-2 border-t border-slate-800/80">
        <div class="flex items-center gap-1.5 ${
          isOverdue
            ? 'text-rose-400 font-semibold'
            : isCompleted
            ? 'text-slate-400'
            : 'text-slate-400'
        }">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span class="font-mono">${task.dueDate || 'No date'}</span>
          ${isOverdue ? '<span class="text-[10px] uppercase font-bold text-rose-400 bg-rose-500/15 px-1 py-0.2 rounded">Late</span>' : ''}
        </div>

        <!-- Quick move stage dropdown -->
        <select
          data-action="quick-status"
          data-id="${task.id}"
          class="bg-slate-900 border border-slate-800 text-slate-300 rounded-lg text-[10px] px-1.5 py-0.5 focus:outline-none cursor-pointer hover:border-slate-700"
          title="Move to another status column"
        >
          <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>To Do</option>
          <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
          <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>Completed</option>
        </select>
      </div>
    </div>
  `;
}

function createListItemHtml(task: Task): string {
  const todayStr = new Date().toISOString().split('T')[0];
  const isOverdue = task.status !== 'completed' && task.dueDate && task.dueDate < todayStr;
  const isCompleted = task.status === 'completed';

  const priorityClasses: Record<TaskPriority, string> = {
    urgent: 'border-l-rose-500',
    high: 'border-l-orange-500',
    medium: 'border-l-amber-500',
    low: 'border-l-sky-500',
  };

  const categoryBadgeClasses: Record<TaskCategory, string> = {
    work: 'badge-category-work',
    personal: 'badge-category-personal',
    shopping: 'badge-category-shopping',
    study: 'badge-category-study',
    other: 'badge-category-other',
  };

  const categoryLabel: Record<TaskCategory, string> = {
    work: 'Work',
    personal: 'Personal',
    shopping: 'Shopping',
    study: 'Study',
    other: 'Other',
  };

  const taskCat: TaskCategory = task.category || 'work';

  return `
    <div
      data-task-id="${task.id}"
      class="glass-card rounded-xl p-3.5 border-l-4 ${priorityClasses[task.priority]} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group"
    >
      <div class="flex items-start gap-3 flex-1 min-w-0">
        <button
          data-action="toggle-complete"
          data-id="${task.id}"
          type="button"
          class="mt-0.5 shrink-0 w-4 h-4 rounded border ${
            isCompleted
              ? 'bg-emerald-500 border-emerald-500 text-white flex items-center justify-center'
              : 'border-slate-600 hover:border-slate-400'
          } transition-colors"
        >
          ${
            isCompleted
              ? `<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" /></svg>`
              : ''
          }
        </button>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <h4 class="text-xs font-semibold text-white truncate ${
              isCompleted ? 'line-through text-slate-400' : ''
            }">
              ${escapeHtml(task.title)}
            </h4>
            <span class="text-[10px] font-medium px-2 py-0.2 rounded ${categoryBadgeClasses[taskCat]}">
              ${categoryLabel[taskCat]}
            </span>
            <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase">
              ${task.priority}
            </span>
          </div>
          ${
            task.description
              ? `<p class="text-[11px] text-slate-400 mt-0.5 truncate">${escapeHtml(task.description)}</p>`
              : ''
          }
        </div>
      </div>

      <div class="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800">
        <!-- Due Date -->
        <span class="text-[11px] font-mono ${isOverdue ? 'text-rose-400 font-semibold' : 'text-slate-400'}">
          ${task.dueDate || 'No date'} ${isOverdue ? '(Overdue)' : ''}
        </span>

        <!-- Status selector -->
        <select
          data-action="quick-status"
          data-id="${task.id}"
          class="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
        >
          <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>To Do</option>
          <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
          <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>Completed</option>
        </select>

        <!-- Actions -->
        <div class="flex items-center gap-1">
          <button data-action="edit" data-id="${task.id}" type="button" class="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800" title="Edit">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button data-action="delete" data-id="${task.id}" type="button" class="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10" title="Delete">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// Interactive Event Listeners & Drag and Drop
// -------------------------------------------------------------
function attachCardEventListeners(): void {
  // Toggle complete checkbox
  document.querySelectorAll('[data-action="toggle-complete"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id;
      if (!id) return;
      const task = allTasks.find((t) => t.id === id);
      if (!task) return;

      const newStatus: TaskStatus = task.status === 'completed' ? 'todo' : 'completed';
      try {
        await updateTask(id, { status: newStatus });
        showToast(
          newStatus === 'completed' ? 'Task marked as completed!' : 'Task reopened.',
          'success'
        );
      } catch (err: any) {
        showToast(`Failed to update status: ${err.message}`, 'error');
      }
    });
  });

  // Quick status selector
  document.querySelectorAll('[data-action="quick-status"]').forEach((select) => {
    select.addEventListener('change', async (e) => {
      e.stopPropagation();
      const target = select as HTMLSelectElement;
      const id = target.dataset.id;
      if (!id) return;
      const newStatus = target.value as TaskStatus;
      try {
        await updateTask(id, { status: newStatus });
        showToast(`Status shifted to ${newStatus.replace('_', ' ')}`, 'info');
      } catch (err: any) {
        showToast(`Failed to update status: ${err.message}`, 'error');
      }
    });
  });

  // Edit task button
  document.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id;
      if (!id) return;
      openEditTaskModal(id);
    });
  });

  // Delete task button
  document.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id;
      if (!id) return;
      openDeleteConfirmation(id);
    });
  });

  // Drag and drop for Kanban cards
  document.querySelectorAll('.task-card[draggable="true"]').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      const dragEvent = e as DragEvent;
      const id = (card as HTMLElement).dataset.taskId;
      if (!id) return;
      draggedTaskId = id;
      card.classList.add('dragging');
      if (dragEvent.dataTransfer) {
        dragEvent.dataTransfer.setData('text/plain', id);
        dragEvent.dataTransfer.effectAllowed = 'move';
      }
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      draggedTaskId = null;
      document.querySelectorAll('.kanban-col').forEach((col) => col.classList.remove('drag-over'));
    });
  });
}

function setupKanbanDragAndDrop(): void {
  document.querySelectorAll('.kanban-col').forEach((col) => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragEvent = e as DragEvent;
      if (dragEvent.dataTransfer) {
        dragEvent.dataTransfer.dropEffect = 'move';
      }
      col.classList.add('drag-over');
    });

    col.addEventListener('dragleave', (e) => {
      const related = (e as MouseEvent).relatedTarget as Node | null;
      if (!col.contains(related)) {
        col.classList.remove('drag-over');
      }
    });

    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const targetColStatus = (col as HTMLElement).dataset.colStatus as TaskStatus;
      if (!targetColStatus || !draggedTaskId) return;

      const task = allTasks.find((t) => t.id === draggedTaskId);
      if (task && task.status !== targetColStatus) {
        try {
          await updateTask(task.id, { status: targetColStatus });
          showToast(`Task moved to ${targetColStatus.replace('_', ' ')}`, 'info');
        } catch (err: any) {
          showToast(`Drag move failed: ${err.message}`, 'error');
        }
      }
    });
  });
}

// -------------------------------------------------------------
// Modal Dialog Controller: Create & Edit Task
// -------------------------------------------------------------
function openCreateTaskModal(defaultStatus: TaskStatus = 'todo'): void {
  const taskForm = getEl<HTMLFormElement>('task-form');
  const taskFormId = getEl<HTMLInputElement>('task-form-id');
  const taskModalTitle = getEl('task-modal-title');
  const taskSaveText = getEl('task-save-text');
  const taskFormStatus = getEl<HTMLSelectElement>('task-form-status');
  const taskFormPriority = getEl<HTMLSelectElement>('task-form-priority');
  const taskFormCategory = getEl<HTMLSelectElement>('task-form-category');
  const taskFormDueDate = getEl<HTMLInputElement>('task-form-duedate');
  const taskFormError = getEl('task-form-error');

  taskForm?.reset();
  if (taskFormId) taskFormId.value = '';
  editingTaskId = null;
  if (taskModalTitle) taskModalTitle.textContent = 'Create New Task';
  if (taskSaveText) taskSaveText.textContent = 'Create Task';
  if (taskFormStatus) taskFormStatus.value = defaultStatus;
  if (taskFormPriority) taskFormPriority.value = 'medium';
  if (taskFormCategory) taskFormCategory.value = 'work';
  taskFormError?.classList.add('hidden');

  // Default due date to today
  const todayStr = new Date().toISOString().split('T')[0];
  if (taskFormDueDate) taskFormDueDate.value = todayStr;

  updateCharCounters();
  modalManager.openModal('task-modal');
}

function openEditTaskModal(taskId: string): void {
  const task = allTasks.find((t) => t.id === taskId);
  if (!task) return;

  const taskFormId = getEl<HTMLInputElement>('task-form-id');
  const taskFormTitle = getEl<HTMLInputElement>('task-form-title');
  const taskFormDesc = getEl<HTMLTextAreaElement>('task-form-desc');
  const taskFormDueDate = getEl<HTMLInputElement>('task-form-duedate');
  const taskFormPriority = getEl<HTMLSelectElement>('task-form-priority');
  const taskFormStatus = getEl<HTMLSelectElement>('task-form-status');
  const taskFormCategory = getEl<HTMLSelectElement>('task-form-category');
  const taskModalTitle = getEl('task-modal-title');
  const taskSaveText = getEl('task-save-text');
  const taskFormError = getEl('task-form-error');

  editingTaskId = taskId;
  if (taskFormId) taskFormId.value = taskId;
  if (taskFormTitle) taskFormTitle.value = task.title;
  if (taskFormDesc) taskFormDesc.value = task.description || '';
  if (taskFormDueDate) taskFormDueDate.value = task.dueDate;
  if (taskFormPriority) taskFormPriority.value = task.priority;
  if (taskFormStatus) taskFormStatus.value = task.status;
  if (taskFormCategory) taskFormCategory.value = task.category || 'work';

  if (taskModalTitle) taskModalTitle.textContent = 'Edit Task Details';
  if (taskSaveText) taskSaveText.textContent = 'Update Task';
  taskFormError?.classList.add('hidden');

  updateCharCounters();
  modalManager.openModal('task-modal');
}

function updateCharCounters(): void {
  const titleInput = getEl<HTMLInputElement>('task-form-title');
  const descInput = getEl<HTMLTextAreaElement>('task-form-desc');
  const titleCounter = getEl('title-char-counter');
  const descCounter = getEl('desc-char-counter');

  if (titleCounter && titleInput) {
    titleCounter.textContent = `${titleInput.value.length} / 120`;
  }
  if (descCounter && descInput) {
    descCounter.textContent = `${descInput.value.length} / 1000`;
  }
}

function openDeleteConfirmation(taskId: string): void {
  const task = allTasks.find((t) => t.id === taskId);
  if (!task) return;
  taskToDelete = task;
  const deleteTitle = getEl('confirm-delete-task-title');
  if (deleteTitle) deleteTitle.textContent = `"${task.title}"`;
  modalManager.openModal('confirm-modal');
}

// -------------------------------------------------------------
// Form Submissions & Handlers
// -------------------------------------------------------------
function setupFormListeners(): void {
  const taskFormTitle = getEl<HTMLInputElement>('task-form-title');
  const taskFormDesc = getEl<HTMLTextAreaElement>('task-form-desc');
  const taskForm = getEl<HTMLFormElement>('task-form');
  const confirmDeleteBtn = getEl<HTMLButtonElement>('confirm-delete-btn');
  const exportMenuBtn = getEl<HTMLButtonElement>('export-menu-btn');
  const exportDropdown = getEl('export-dropdown');
  const exportCsvBtn = getEl<HTMLButtonElement>('export-csv-btn');
  const exportJsonBtn = getEl<HTMLButtonElement>('export-json-btn');
  const globalSearchInput = getEl<HTMLInputElement>('global-search-input');
  const mobileSearchInput = getEl<HTMLInputElement>('mobile-search-input');
  const clearSearchBtn = getEl<HTMLButtonElement>('clear-search-btn');
  const filterPrioritySelect = getEl<HTMLSelectElement>('filter-priority-select');
  const filterCategorySelect = getEl<HTMLSelectElement>('filter-category-select');
  const sortFieldSelect = getEl<HTMLSelectElement>('sort-field-select');
  const sortDirectionBtn = getEl<HTMLButtonElement>('sort-direction-btn');
  const viewToggleBoard = getEl<HTMLButtonElement>('view-toggle-board');
  const viewToggleList = getEl<HTMLButtonElement>('view-toggle-list');
  const sidebarFilterOverdue = getEl('sidebar-filter-overdue');
  const mobileMenuToggle = getEl('mobile-menu-toggle');

  // Title and description live counters
  taskFormTitle?.addEventListener('input', updateCharCounters);
  taskFormDesc?.addEventListener('input', updateCharCounters);

  // Task Create / Edit Form
  taskForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('You must be signed in to manage tasks.', 'error');
      return;
    }

    const titleEl = getEl<HTMLInputElement>('task-form-title');
    const descEl = getEl<HTMLTextAreaElement>('task-form-desc');
    const dueDateEl = getEl<HTMLInputElement>('task-form-duedate');
    const prioEl = getEl<HTMLSelectElement>('task-form-priority');
    const statusEl = getEl<HTMLSelectElement>('task-form-status');
    const catEl = getEl<HTMLSelectElement>('task-form-category');
    const errorEl = getEl('task-form-error');

    const title = titleEl?.value.trim() || '';
    const description = descEl?.value.trim() || '';
    const dueDate = dueDateEl?.value || '';
    const priority = (prioEl?.value || 'medium') as TaskPriority;
    const status = (statusEl?.value || 'todo') as TaskStatus;
    const category = (catEl?.value || 'work') as TaskCategory;

    // Strict client validation adhering to firebase-blueprint.json
    if (!title || title.length > 120) {
      if (errorEl) {
        errorEl.textContent = 'Title is required and must not exceed 120 characters.';
        errorEl.classList.remove('hidden');
      }
      titleEl?.focus();
      return;
    }

    if (!dueDate) {
      if (errorEl) {
        errorEl.textContent = 'Please choose a valid due date.';
        errorEl.classList.remove('hidden');
      }
      dueDateEl?.focus();
      return;
    }

    const inputData: TaskInput = {
      title,
      description: description || undefined,
      category,
      dueDate,
      priority,
      status,
    };

    const spinner = getEl('task-save-spinner');
    const text = getEl('task-save-text');
    const submitBtn = getEl<HTMLButtonElement>('task-form-save-btn');

    try {
      spinner?.classList.remove('hidden');
      text?.classList.add('opacity-70');
      if (submitBtn) submitBtn.disabled = true;

      if (editingTaskId) {
        await updateTask(editingTaskId, inputData);
        showToast('Task updated successfully!', 'success');
      } else {
        await createTask(currentUser.uid, inputData);
        showToast('New task added to Cloud Firestore!', 'success');
      }

      modalManager.closeModal('task-modal');
      taskForm.reset();
    } catch (err: any) {
      if (errorEl) {
        errorEl.textContent = `Operation failed: ${err.message}`;
        errorEl.classList.remove('hidden');
      }
    } finally {
      spinner?.classList.add('hidden');
      text?.classList.remove('opacity-70');
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Confirm delete handler
  confirmDeleteBtn?.addEventListener('click', async () => {
    if (!taskToDelete) return;

    const spinner = getEl('confirm-delete-spinner');
    try {
      confirmDeleteBtn.disabled = true;
      spinner?.classList.remove('hidden');
      await deleteTask(taskToDelete.id);
      showToast('Task deleted successfully.', 'info');
      modalManager.closeModal('confirm-modal');
    } catch (err: any) {
      showToast(`Delete failed: ${err.message}`, 'error');
    } finally {
      confirmDeleteBtn.disabled = false;
      spinner?.classList.add('hidden');
      taskToDelete = null;
    }
  });

  // Close modal buttons handler
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modalId = (btn as HTMLElement).dataset.closeModal;
      if (modalId) {
        modalManager.closeModal(modalId);
      }
    });
  });

  // Quick Add buttons in column headers
  document.querySelectorAll('[data-quick-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const status = (btn as HTMLElement).dataset.quickAdd as TaskStatus;
      openCreateTaskModal(status);
    });
  });

  // Primary Create Task Buttons
  getEl('top-create-task-btn')?.addEventListener('click', () => {
    openCreateTaskModal('todo');
  });
  getEl('content-create-task-btn')?.addEventListener('click', () => {
    openCreateTaskModal('todo');
  });
  getEl('empty-create-task-btn')?.addEventListener('click', () => {
    openCreateTaskModal('todo');
  });

  // Export menu toggle & actions
  exportMenuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown?.classList.toggle('hidden');
  });

  exportCsvBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown?.classList.add('hidden');
    if (allTasks.length === 0) {
      showToast('No tasks available to export.', 'info');
      return;
    }
    exportTasksAsCSV(allTasks);
    showToast(`Exported ${allTasks.length} tasks as CSV spreadsheet.`, 'success');
  });

  exportJsonBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown?.classList.add('hidden');
    if (allTasks.length === 0) {
      showToast('No tasks available to export.', 'info');
      return;
    }
    exportTasksAsJSON(allTasks);
    showToast(`Exported ${allTasks.length} tasks as JSON backup.`, 'success');
  });

  // Search input listeners
  const handleSearch = (query: string) => {
    filterState.searchQuery = query.trim();
    if (filterState.searchQuery) {
      clearSearchBtn?.classList.remove('hidden');
    } else {
      clearSearchBtn?.classList.add('hidden');
    }
    applyFiltersAndRender();
  };

  globalSearchInput?.addEventListener('input', (e) => {
    handleSearch((e.target as HTMLInputElement).value);
  });
  mobileSearchInput?.addEventListener('input', (e) => {
    handleSearch((e.target as HTMLInputElement).value);
  });
  clearSearchBtn?.addEventListener('click', () => {
    if (globalSearchInput) globalSearchInput.value = '';
    if (mobileSearchInput) mobileSearchInput.value = '';
    handleSearch('');
    globalSearchInput?.focus();
  });

  // Priority select filter
  filterPrioritySelect?.addEventListener('change', () => {
    if (filterPrioritySelect) {
      filterState.priority = filterPrioritySelect.value as any;
      applyFiltersAndRender();
    }
  });

  // Category select filter (in toolbar)
  filterCategorySelect?.addEventListener('change', () => {
    if (filterCategorySelect) {
      filterState.category = filterCategorySelect.value as any;
      updateCategoryNav();
      applyFiltersAndRender();
    }
  });

  // Sort field and direction
  sortFieldSelect?.addEventListener('change', () => {
    if (sortFieldSelect) {
      filterState.sortBy = sortFieldSelect.value as any;
      applyFiltersAndRender();
    }
  });

  sortDirectionBtn?.addEventListener('click', () => {
    filterState.sortDirection = filterState.sortDirection === 'asc' ? 'desc' : 'asc';
    sortDirectionBtn.title = `Sort ${filterState.sortDirection.toUpperCase()}`;
    applyFiltersAndRender();
  });

  // View switchers (Board vs List)
  viewToggleBoard?.addEventListener('click', () => {
    viewMode = 'board';
    viewToggleBoard.classList.add('active', 'bg-indigo-600', 'text-white', 'shadow-sm');
    viewToggleBoard.classList.remove('text-slate-400');
    viewToggleList?.classList.remove('active', 'bg-indigo-600', 'text-white', 'shadow-sm');
    viewToggleList?.classList.add('text-slate-400');
    applyFiltersAndRender();
  });

  viewToggleList?.addEventListener('click', () => {
    viewMode = 'list';
    viewToggleList.classList.add('active', 'bg-indigo-600', 'text-white', 'shadow-sm');
    viewToggleList.classList.remove('text-slate-400');
    viewToggleBoard?.classList.remove('active', 'bg-indigo-600', 'text-white', 'shadow-sm');
    viewToggleBoard?.classList.add('text-slate-400');
    applyFiltersAndRender();
  });

  // Sidebar Status Filters
  document.querySelectorAll('[data-filter-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const status = (btn as HTMLElement).dataset.filterStatus as any;
      filterState.status = status;
      filterState.overdueOnly = false;
      updateSidebarNav();
      applyFiltersAndRender();
    });
  });

  // Sidebar Overdue Filter
  sidebarFilterOverdue?.addEventListener('click', () => {
    filterState.overdueOnly = true;
    filterState.status = 'all';
    updateSidebarNav();
    applyFiltersAndRender();
  });

  // Sidebar Category Filter Buttons
  document.querySelectorAll('[data-category-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = (btn as HTMLElement).dataset.categoryBtn as TaskCategory;
      filterState.category = cat;
      const catSelect = getEl<HTMLSelectElement>('filter-category-select');
      if (catSelect) catSelect.value = cat;
      updateCategoryNav();
      applyFiltersAndRender();
    });
  });

  getEl('reset-category-filter-btn')?.addEventListener('click', () => {
    filterState.category = 'all';
    const catSelect = getEl<HTMLSelectElement>('filter-category-select');
    if (catSelect) catSelect.value = 'all';
    updateCategoryNav();
    applyFiltersAndRender();
  });

  // Priority Quick Pills in Sidebar
  document.querySelectorAll('[data-priority-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prio = (btn as HTMLElement).dataset.priorityBtn as TaskPriority;
      filterState.priority = prio;
      const prioSelect = getEl<HTMLSelectElement>('filter-priority-select');
      if (prioSelect) prioSelect.value = prio;
      applyFiltersAndRender();
    });
  });

  getEl('reset-priority-filter-btn')?.addEventListener('click', () => {
    filterState.priority = 'all';
    const prioSelect = getEl<HTMLSelectElement>('filter-priority-select');
    if (prioSelect) prioSelect.value = 'all';
    applyFiltersAndRender();
  });

  // Documentation / Guide Modal buttons
  getEl('open-guide-btn')?.addEventListener('click', () => {
    modalManager.openModal('guide-modal');
  });
  getEl('sidebar-view-specs-btn')?.addEventListener('click', () => {
    modalManager.openModal('guide-modal');
  });
  getEl('menu-view-docs')?.addEventListener('click', () => {
    getEl('user-dropdown')?.classList.add('hidden');
    modalManager.openModal('guide-modal');
  });

  // Documentation Tabs switcher
  document.querySelectorAll('[data-doc-tab]').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const targetTab = (tabBtn as HTMLElement).dataset.docTab;
      document.querySelectorAll('.doc-tab-btn').forEach((b) => {
        b.classList.remove('active', 'text-indigo-400', 'border-b-2', 'border-indigo-500');
        b.classList.add('text-slate-400');
      });
      tabBtn.classList.add('active', 'text-indigo-400', 'border-b-2', 'border-indigo-500');
      tabBtn.classList.remove('text-slate-400');

      document.querySelectorAll('.doc-panel').forEach((panel) => panel.classList.add('hidden'));
      const activePanel = getEl(`doc-panel-${targetTab}`);
      if (activePanel) activePanel.classList.remove('hidden');
    });
  });

  // Mobile menu toggle
  mobileMenuToggle?.addEventListener('click', () => {
    const sidebar = getEl('dashboard-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('hidden');
    }
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (modalManager.isAnyOpen()) return;

    // "/" to focus search
    const globalSearch = getEl<HTMLInputElement>('global-search-input');
    const mobileSearch = getEl<HTMLInputElement>('mobile-search-input');
    const activeSearch = globalSearch || mobileSearch;
    if (e.key === '/' && activeSearch && document.activeElement !== activeSearch) {
      e.preventDefault();
      activeSearch.focus();
    }

    // "n" or "N" to add task
    if ((e.key === 'n' || e.key === 'N') && currentUser) {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
        e.preventDefault();
        openCreateTaskModal('todo');
      }
    }
  });
}

function updateSidebarNav(): void {
  document.querySelectorAll('.sidebar-nav-btn').forEach((btn) => {
    btn.classList.remove('active', 'bg-indigo-600/15', 'text-indigo-400', 'border', 'border-indigo-500/20');
    btn.classList.add('text-slate-300');
  });

  if (filterState.overdueOnly) {
    const overdueBtn = getEl('sidebar-filter-overdue');
    overdueBtn?.classList.add('active', 'bg-rose-500/20', 'border', 'border-rose-500/30');
  } else {
    const activeBtn = document.querySelector(`[data-filter-status="${filterState.status}"]`);
    activeBtn?.classList.add('active', 'bg-indigo-600/15', 'text-indigo-400', 'border', 'border-indigo-500/20');
  }
}

function updateCategoryNav(): void {
  document.querySelectorAll('.category-nav-btn').forEach((btn) => {
    const cat = (btn as HTMLElement).dataset.categoryBtn;
    if (cat === filterState.category) {
      btn.classList.add('bg-indigo-600/20', 'text-indigo-300', 'border', 'border-indigo-500/30');
      btn.classList.remove('text-slate-300');
    } else {
      btn.classList.remove('bg-indigo-600/20', 'text-indigo-300', 'border', 'border-indigo-500/30');
      btn.classList.add('text-slate-300');
    }
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// -------------------------------------------------------------
// App Initialization
// -------------------------------------------------------------
function initApp(): void {
  setupAuthListeners();
  setupFormListeners();
  setupKanbanDragAndDrop();
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
