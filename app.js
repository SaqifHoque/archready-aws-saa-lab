(() => {
  'use strict';

  const bank = (window.AWS_QUESTION_BANK || []).filter((question) =>
    question.question?.trim().length >= 8 && question.answer
  );
  const storeKey = 'archready-progress-v1';
  const themeKey = 'archready-theme';
  const simulatorKey = 'archready-simulator-v1';
  const examDomainWeights = {
    'Design Secure Architectures': 30,
    'Design Resilient Architectures': 26,
    'Design High-Performing Architectures': 24,
    'Design Cost-Optimized Architectures': 20
  };
  const topics = [...new Set(bank.map((question) => question.topic).filter(Boolean))].sort();
  const examDomains = Object.keys(examDomainWeights).filter((domain) => bank.some((question) => question.examDomain === domain));
  const services = window.ARCHREADY_SERVICES || [];
  const learning = window.ARCHREADY_LEARNING || { roadmap: [] };
  const app = document.querySelector('#app');
  let timerId = null;
  let session = null;
  let cloudState = { state: 'local', message: 'Saved in this browser' };

  function currentTheme() { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(themeKey, theme); } catch { /* Theme still applies for this visit. */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#111816' : '#f4f6f3';
    const control = document.querySelector('[data-theme-toggle]');
    if (control) {
      control.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
      control.setAttribute('aria-pressed', String(theme === 'dark'));
    }
  }

  function mountThemeToggle() {
    const header = app.querySelector('.site-header');
    if (!header || header.querySelector('[data-theme-toggle]')) return;
    const control = document.createElement('button');
    control.className = 'theme-toggle';
    control.type = 'button';
    control.dataset.themeToggle = '';
    control.setAttribute('aria-label', 'Toggle color theme');
    control.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
    control.textContent = currentTheme() === 'dark' ? 'Light mode' : 'Dark mode';
    header.append(control);
  }

  const defaultSimulator = () => ({
    stage: 'brief',
    projectName: 'Two-tier customer portal',
    region: 'ap-northeast-1',
    environment: 'production',
    traffic: 'steady',
    dataSensitivity: 'standard',
    vpcCidr: '10.0.0.0/16',
    publicSubnet: '10.0.1.0/24',
    privateSubnet: '10.0.11.0/24',
    natGateway: true,
    waf: true,
    sessionManager: true,
    flowLogs: true,
    ec2Size: 't3.small',
    minInstances: 2,
    maxInstances: 4,
    lambda: true,
    dynamo: true,
    monthlyRequests: 2
  });

  function loadSimulator() {
    try { return { ...defaultSimulator(), ...JSON.parse(localStorage.getItem(simulatorKey) || '{}') }; } catch { return defaultSimulator(); }
  }

  let simulator = loadSimulator();
  function saveSimulator() { try { localStorage.setItem(simulatorKey, JSON.stringify(simulator)); } catch { /* Storage is optional. */ } }

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
      return {
        attempts: Array.isArray(saved.attempts) ? saved.attempts : [],
        stats: saved.stats && typeof saved.stats === 'object' ? saved.stats : {},
        totalSeconds: Number(saved.totalSeconds) || 0,
        studyDates: Array.isArray(saved.studyDates) ? saved.studyDates : [],
        roadmapTasks: saved.roadmapTasks && typeof saved.roadmapTasks === 'object' ? saved.roadmapTasks : {},
        activeSession: saved.activeSession && typeof saved.activeSession === 'object' ? saved.activeSession : null
      };
    } catch {
      return { attempts: [], stats: {}, totalSeconds: 0, studyDates: [], roadmapTasks: {}, activeSession: null };
    }
  }

  const progress = loadProgress();

  function saveProgress(sync = true) {
    try { localStorage.setItem(storeKey, JSON.stringify(progress)); } catch { /* Browser storage can be unavailable. */ }
    if (sync) window.CloudProgress?.scheduleSave(progress);
  }

  function saveActiveSession() {
    if (!session) return;
    progress.activeSession = { ...session, savedAt: Date.now() };
    saveProgress();
  }

  function clearActiveSession() {
    if (!progress.activeSession) return;
    progress.activeSession = null;
    saveProgress();
  }

  function backupPayload() {
    return {
      product: 'ArchReady',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      progress,
      simulator
    };
  }

  function normalizedBackupProgress(value) {
    if (!value || typeof value !== 'object') throw new Error('This file does not contain ArchReady progress.');
    const number = (input) => Number.isFinite(Number(input)) ? Math.max(0, Number(input)) : 0;
    const attempts = Array.isArray(value.attempts) ? value.attempts.slice(0, 100).map((attempt) => ({
      id: String(attempt.id || ''),
      mode: String(attempt.mode || 'practice'),
      title: String(attempt.title || ''),
      completedAt: number(attempt.completedAt),
      duration: number(attempt.duration),
      total: number(attempt.total),
      answered: number(attempt.answered),
      correct: number(attempt.correct),
      score: Math.min(100, number(attempt.score)),
      results: Array.isArray(attempt.results) ? attempt.results.slice(0, 65).map((result) => ({
        qid: String(result.qid || ''), category: String(result.category || 'AWS'),
        correct: Boolean(result.correct), answered: Boolean(result.answered)
      })) : []
    })) : [];
    const stats = Object.fromEntries(Object.entries(value.stats || {}).slice(0, 5000).map(([id, stat]) => {
      const attempts = number(stat?.attempts);
      return [String(id), {
        attempts, correct: Math.min(attempts, number(stat?.correct)),
        category: String(stat?.category || 'AWS'), lastAttemptedAt: number(stat?.lastAttemptedAt)
      }];
    }));
    return {
      attempts,
      stats,
      totalSeconds: number(value.totalSeconds),
      studyDates: Array.isArray(value.studyDates) ? [...new Set(value.studyDates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].slice(-365) : [],
      roadmapTasks: Object.fromEntries(Object.entries(value.roadmapTasks || {}).slice(0, 500).map(([id, complete]) => [String(id), Boolean(complete)])),
      activeSession: null
    };
  }

  function parseBackup(text) {
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error('The selected file is not valid JSON.'); }
    if (payload?.product !== 'ArchReady' || payload?.schemaVersion !== 1) throw new Error('This is not a supported ArchReady backup.');
    return { progress: normalizedBackupProgress(payload.progress), simulator: payload.simulator };
  }

  function todayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  function regexEscape(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const servicePools = new Map(services.map((service) => {
    const patterns = service.aliases.map((alias) => new RegExp(`(^|[^A-Za-z0-9])${regexEscape(alias)}(?=$|[^A-Za-z0-9])`, 'i'));
    const questions = bank.filter((question) => {
      const source = `${question.question}\n${question.answer}`;
      return patterns.some((pattern) => pattern.test(source));
    });
    return [service.id, questions];
  }));

  function answerParts(question) {
    const required = Math.max(1, Number(question.selectionsRequired) || 1);
    let answer = question.answer.replace(/^\s*answers?\s*:\s*/i, '').trim();
    let parts = answer.split(/\n(?=\s*[A-E][.)]\s)|\n(?=\s*[-•]\s+)/).map((part) => part.trim()).filter(Boolean);
    if (required > 1 && parts.length === 1) {
      parts = answer.split(/\s+(?=[A-E][.)]\s)/).map((part) => part.trim()).filter(Boolean);
    }
    return parts.slice(0, required).map((part) => part.replace(/^[A-E][.)]\s*/, '').trim());
  }

  const answerPool = bank.flatMap((question) =>
    answerParts(question).map((text) => ({ id: question.id, category: question.category, text }))
  );

  function hash(value) {
    let result = 2166136261;
    for (const character of String(value)) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function shuffle(items, seed = Date.now()) {
    const values = [...items];
    let state = seed || 1;
    for (let index = values.length - 1; index > 0; index -= 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const swapIndex = state % (index + 1);
      [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
    return values;
  }

  function optionsFor(question) {
    const correct = answerParts(question);
    if (Array.isArray(question.options) && question.options.length >= correct.length) {
      return question.options.map((text) => ({ text, correct: correct.includes(text) }));
    }

    const target = Math.max(question.selectionsRequired > 1 ? 5 : 4, correct.length);
    const related = answerPool.filter((item) =>
      item.id !== question.id && item.category === question.category && !correct.includes(item.text)
    );
    const fallback = answerPool.filter((item) => item.id !== question.id && !correct.includes(item.text));
    const distractors = [];
    for (const item of [...shuffle(related, hash(question.id)), ...shuffle(fallback, hash(`${question.id}-fallback`))]) {
      if (!distractors.includes(item.text)) distractors.push(item.text);
      if (distractors.length >= target - correct.length) break;
    }
    return shuffle([...correct, ...distractors], hash(`${question.id}-options`))
      .map((text) => ({ text, correct: correct.includes(text) }));
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return hours ? `${hours}h ${minutes}m` : `${minutes} min`;
  }

  function formatDate(timestamp) {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(timestamp));
  }

  function cloudBadge() {
    const label = cloudState.state === 'synced' ? 'Cloud synced' : cloudState.state === 'syncing' ? 'Syncing…' : cloudState.state === 'error' ? 'Sync issue' : 'Local progress';
    return `<span id="cloud-status" class="cloud-status ${escapeHTML(cloudState.state)}" title="${escapeHTML(cloudState.message || label)}">${label}</span>`;
  }

  function refreshCloudBadge() {
    const badge = document.querySelector('#cloud-status');
    if (!badge) return;
    const label = cloudState.state === 'synced' ? 'Cloud synced' : cloudState.state === 'syncing' ? 'Syncing…' : cloudState.state === 'error' ? 'Sync issue' : 'Local progress';
    badge.className = `cloud-status ${cloudState.state}`;
    badge.textContent = label;
    badge.title = cloudState.message || label;
  }

  function modeTitle(mode) {
    if (mode === 'mock') return 'Full mock exam';
    if (mode === 'review') return 'Weak-area drill';
    if (mode === 'domain') return 'Exam domain practice';
    if (mode === 'topic') return 'Topic practice';
    if (mode === 'service') return 'Service practice';
    if (mode === 'custom') return 'Custom practice';
    return 'Quick practice';
  }

  function progressSummary() {
    const questionStats = Object.values(progress.stats);
    const answers = questionStats.reduce((total, stat) => total + stat.attempts, 0);
    const correct = questionStats.reduce((total, stat) => total + stat.correct, 0);
    return {
      accuracy: answers ? Math.round((correct / answers) * 100) : 0,
      explored: questionStats.length,
      sessions: progress.attempts.length,
      studyTime: formatDuration(progress.totalSeconds)
    };
  }

  function readinessSummary() {
    const summary = progressSummary();
    const mocks = progress.attempts.filter((attempt) => attempt.mode === 'mock' && attempt.answered > 0);
    const latestMocks = mocks.slice(0, 5);
    const gateMocks = mocks.slice(0, 4);
    const mockAverage = latestMocks.length
      ? Math.round(latestMocks.reduce((total, attempt) => total + attempt.score, 0) / latestMocks.length)
      : 0;
    const coverage = Math.min(100, Math.round((summary.explored / Math.min(250, bank.length)) * 100));
    const scores = latestMocks.map((attempt) => attempt.score);
    const consistency = scores.length > 1 ? Math.max(0, 100 - (Math.max(...scores) - Math.min(...scores))) : 0;
    const score = Math.round((summary.accuracy * 0.55) + (mockAverage * 0.25) + (coverage * 0.15) + (consistency * 0.05));
    const qualifyingMocks = gateMocks.filter((attempt) => attempt.score >= 85).length;
    return {
      score,
      mockAverage,
      coverage,
      qualifyingMocks,
      gateCount: gateMocks.length,
      examReady: qualifyingMocks >= 3
    };
  }

  function weakQuestionPool() {
    const attempted = bank.filter((question) => {
      const stat = progress.stats[question.id];
      return stat && stat.attempts > 0 && (stat.correct / stat.attempts) < 0.75;
    });
    const categoryTotals = Object.values(progress.stats).reduce((totals, stat) => {
      const category = stat.category || 'AWS';
      const current = totals[category] || { attempts: 0, correct: 0 };
      current.attempts += stat.attempts;
      current.correct += stat.correct;
      totals[category] = current;
      return totals;
    }, {});
    const weakestCategory = Object.entries(categoryTotals)
      .filter(([, value]) => value.attempts > 0)
      .sort(([, left], [, right]) => (left.correct / left.attempts) - (right.correct / right.attempts))[0]?.[0];
    const categoryQuestions = weakestCategory ? bank.filter((question) => question.category === weakestCategory) : [];
    const combined = [...attempted, ...categoryQuestions, ...bank];
    return [...new Map(combined.map((question) => [question.id, question])).values()];
  }

  function resumableSession() {
    const saved = progress.activeSession;
    const valid = saved && Array.isArray(saved.questions) && saved.questions.length
      && Number.isInteger(saved.index) && saved.index >= 0 && saved.index < saved.questions.length
      && saved.questions.every((question) => question && typeof question.question === 'string'
        && Array.isArray(question.options) && Array.isArray(question.selected));
    if (!valid) {
      if (saved) clearActiveSession();
      return null;
    }
    if (saved.mode === 'mock') {
      const remaining = Math.max(0, Math.ceil((Number(saved.deadlineAt) - Date.now()) / 1000));
      if (!Number.isFinite(Number(saved.deadlineAt)) || !remaining) {
        clearActiveSession();
        return null;
      }
      return { ...saved, remaining };
    }
    return saved;
  }

  function resumeSession() {
    const saved = resumableSession();
    if (!saved) { home(); return; }
    session = JSON.parse(JSON.stringify(saved));
    renderExam();
    if (session.remaining !== null) startTimer();
  }

  function summarizePool(questions) {
    const stats = questions.map((question) => progress.stats[question.id]).filter((stat) => stat?.attempts > 0);
    const attempts = stats.reduce((total, stat) => total + stat.attempts, 0);
    const correct = stats.reduce((total, stat) => total + stat.correct, 0);
    return {
      completed: stats.length,
      coverage: questions.length ? Math.round((stats.length / questions.length) * 100) : 0,
      accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
      attempts,
      correct
    };
  }

  function focusInsights() {
    const weakest = (entries) => entries
      .map(([name, questions]) => ({ name, questions, ...summarizePool(questions) }))
      .filter((entry) => entry.attempts >= 3)
      .sort((left, right) => left.accuracy - right.accuracy || right.attempts - left.attempts)[0] || null;
    return {
      topic: weakest(topics.map((topic) => [topic, bank.filter((question) => question.topic === topic)])),
      domain: weakest(examDomains.map((domain) => [domain, bank.filter((question) => question.examDomain === domain)]))
    };
  }

  function home() {
    stopTimer();
    session = null;
    const summary = progressSummary();
    const readiness = readinessSummary();
    const insights = focusInsights();
    const active = resumableSession();
    app.innerHTML = `
      <header class="site-header"><div class="brand">Arch<span>Ready</span></div><div class="header-status">${cloudBadge()}<span class="tag">${bank.length} questions</span></div></header>
      <div class="shell hero">
        <section class="panel">
          <div class="eyebrow">AWS Solutions Architect Associate</div>
          <h1>Practice the decision, not the guess.</h1>
          <p class="subtext">Build exam stamina with focused practice or a complete 65-question, 130-minute simulation.</p>
          <div class="actions"><button class="btn btn-primary" data-start="practice">Start quick practice</button><button class="btn" data-route="roadmap">Open roadmap</button><button class="btn" data-route="domains">Explore domains</button><button class="btn" data-route="services">Explore services</button><button class="btn" data-route="simulator">Open simulator</button><button class="btn" data-route="backup">Backup progress</button><button class="btn" data-start="review">Train weak areas</button><button class="btn" data-start="mock">Take full mock</button></div>
        </section>
        <aside class="panel session-options">
          ${active ? `<div class="active-session"><div><span class="tag">Saved session</span><h3>Continue ${escapeHTML(active.title || modeTitle(active.mode))}</h3><p>Question ${active.index + 1} of ${active.questions.length}${active.remaining === null ? '' : ` · ${formatTime(active.remaining)} remaining`}.</p></div><div class="actions"><button class="btn btn-primary" data-resume>Resume</button><button class="btn" data-discard-session>Discard</button></div></div>` : ''}
          <div class="mode"><h3>Quick practice</h3><p>10 untimed questions for a focused study block.</p><button class="btn" data-start="practice">Begin 10 questions</button></div>
          <div class="mode"><h3>Full mock</h3><p>65 questions with a 130-minute countdown.</p><button class="btn" data-start="mock">Begin timed exam</button></div>
          <div class="mode"><h3>Weak-area drill</h3><p>15 adaptive questions based on your lowest-performing material.</p><button class="btn" data-start="review">Train weak areas</button></div>
          <div class="mode"><h3>Custom session</h3><p>Choose a smaller or larger untimed question set.</p><div class="custom-controls"><div class="field"><label for="custom-count">Questions</label><input id="custom-count" type="number" min="5" max="65" value="20"></div><button class="btn" data-start="custom">Start custom</button></div></div>
        </aside>
      </div>
      <div class="shell progress-section">
        <section class="metric-grid" aria-label="Learning progress">
          <div class="metric"><span>Overall accuracy</span><strong>${summary.accuracy}%</strong><small>Across every answered question</small></div>
          <div class="metric"><span>Questions explored</span><strong>${summary.explored}</strong><small>of ${bank.length} available</small></div>
          <div class="metric"><span>Completed sessions</span><strong>${summary.sessions}</strong><small>Practice and full mocks</small></div>
          <div class="metric"><span>Focused study</span><strong>${summary.studyTime}</strong><small>Recorded session time</small></div>
        </section>
        <section class="panel insight-panel">
          <div class="section-heading"><div><div class="eyebrow">Recommended next step</div><h2>${insights.topic || insights.domain ? 'Target the evidence.' : 'Build your first signal.'}</h2><p class="subtext">${insights.topic || insights.domain ? 'These areas have the lowest accuracy among material with at least three answered questions.' : 'Complete a few questions and ArchReady will identify the areas that need focused practice.'}</p></div></div>
          ${insights.topic || insights.domain ? `<div class="insight-grid">${insights.topic ? `<article class="insight-card"><span class="tag">Learning topic</span><h3>${escapeHTML(insights.topic.name)}</h3><p><strong>${insights.topic.accuracy}%</strong> accuracy across ${insights.topic.attempts} answer${insights.topic.attempts === 1 ? '' : 's'}.</p><button class="btn btn-primary" data-topic="${escapeHTML(insights.topic.name)}">Practice topic</button></article>` : ''}${insights.domain ? `<article class="insight-card"><span class="tag">Exam domain</span><h3>${escapeHTML(insights.domain.name)}</h3><p><strong>${insights.domain.accuracy}%</strong> accuracy across ${insights.domain.attempts} answer${insights.domain.attempts === 1 ? '' : 's'}.</p><button class="btn btn-primary" data-exam-domain="${escapeHTML(insights.domain.name)}">Practice domain</button></article>` : ''}</div>` : '<div class="insight-empty"><span class="tag">No recommendation yet</span><p>Practice sessions stay separate from readiness until you have enough answer history to form a useful recommendation.</p></div>'}
        </section>
        <section class="panel readiness-panel">
          <div class="readiness-ring" style="--readiness:${readiness.score}" aria-label="Learning readiness ${readiness.score} percent"><strong>${readiness.score}%</strong><span>learning score</span></div>
          <div><div class="eyebrow">Readiness evidence</div><h2>${readiness.examReady ? 'You are exam-ready.' : 'Build repeatable mock results.'}</h2><p class="subtext">${readiness.examReady ? `${readiness.qualifyingMocks} of your latest ${readiness.gateCount} full mocks reached 85% or higher.` : `Exam-ready status requires at least 3 of the latest 4 full mocks at 85% or higher. You currently have ${readiness.qualifyingMocks} qualifying result${readiness.qualifyingMocks === 1 ? '' : 's'}.`}</p><div class="readiness-signals"><span>Accuracy <strong>${summary.accuracy}%</strong></span><span>Mock average <strong>${readiness.mockAverage}%</strong></span><span>Coverage <strong>${readiness.coverage}%</strong></span></div></div>
          <button class="btn btn-primary" data-start="mock">Take a full mock</button>
        </section>
        <section class="panel recent-panel">
          <div class="section-heading"><div><div class="eyebrow">Recent activity</div><h2>Your latest sessions</h2></div>${progress.attempts.length ? '<button class="btn" data-route="history">View all history</button>' : ''}</div>
          ${progress.attempts.length ? `<div class="activity-list">${progress.attempts.slice(0, 5).map((attempt) => `<div class="activity-item"><span class="activity-score">${attempt.score}%</span><div><strong>${escapeHTML(attempt.title || modeTitle(attempt.mode))}</strong><small>${formatDate(attempt.completedAt)} · ${attempt.total} questions · ${formatDuration(attempt.duration)}</small></div><span class="tag">${attempt.correct}/${attempt.total}</span></div>`).join('')}</div>` : '<div class="empty-progress"><strong>No sessions yet</strong><p class="subtext">Complete a practice set to start building your learning history.</p></div>'}
        </section>
      </div>`;
  }

  function sessionHistory(filter = 'all') {
    const groups = {
      all: () => true,
      mock: (attempt) => attempt.mode === 'mock',
      practice: (attempt) => ['practice', 'custom'].includes(attempt.mode),
      focused: (attempt) => ['review', 'domain', 'topic', 'service'].includes(attempt.mode)
    };
    const selectedFilter = groups[filter] ? filter : 'all';
    const attempts = progress.attempts.filter(groups[selectedFilter]);
    const average = attempts.length ? Math.round(attempts.reduce((total, attempt) => total + Number(attempt.score || 0), 0) / attempts.length) : 0;
    const answered = attempts.reduce((total, attempt) => total + Number(attempt.answered || 0), 0);
    const duration = attempts.reduce((total, attempt) => total + Number(attempt.duration || 0), 0);
    app.innerHTML = `
      <header class="site-header"><div class="brand">Arch<span>Ready</span></div><button class="btn" data-home>Back to dashboard</button></header>
      <div class="shell history-shell">
        <section class="history-heading">
          <div><div class="eyebrow">Learning record</div><h1>Session history</h1><p class="subtext">Review every completed study session stored in your progress.</p></div>
          <div class="history-filters" aria-label="Filter session history">${Object.keys(groups).map((name) => `<button class="btn ${selectedFilter === name ? 'btn-primary' : ''}" data-history-filter="${name}" aria-pressed="${selectedFilter === name}">${name === 'all' ? 'All sessions' : name[0].toUpperCase() + name.slice(1)}</button>`).join('')}</div>
        </section>
        <section class="history-metrics" aria-label="Filtered history summary">
          <div><span>Sessions</span><strong>${attempts.length}</strong></div>
          <div><span>Average score</span><strong>${average}%</strong></div>
          <div><span>Answers submitted</span><strong>${answered}</strong></div>
          <div><span>Study time</span><strong>${formatDuration(duration)}</strong></div>
        </section>
        <section class="history-list">${attempts.length ? attempts.map((attempt) => `<article class="history-item"><span class="activity-score">${Number(attempt.score || 0)}%</span><div><strong>${escapeHTML(attempt.title || modeTitle(attempt.mode))}</strong><small>${formatDate(attempt.completedAt)} · ${attempt.total} questions · ${formatDuration(Number(attempt.duration || 0))}</small></div><span class="tag">${attempt.correct}/${attempt.total} correct</span></article>`).join('') : '<div class="panel empty-progress"><strong>No sessions in this category</strong><p class="subtext">Choose another filter or complete a new session.</p></div>'}</section>
      </div>`;
  }

  function backupCenter(message = '', error = false) {
    app.innerHTML = `
      <header class="site-header"><div class="brand">Arch<span>Ready</span></div><button class="btn" data-home>Back to dashboard</button></header>
      <div class="shell backup-shell">
        <section class="backup-heading"><div class="eyebrow">Portable learner data</div><h1>Backup progress</h1><p class="subtext">Download completed sessions, statistics, roadmap progress, and simulator settings as a JSON file.</p></section>
        ${message ? `<div class="backup-message ${error ? 'error' : ''}" role="status">${escapeHTML(message)}</div>` : ''}
        <section class="backup-grid">
          <article class="panel backup-card"><span class="tag">Export</span><h2>Save a copy</h2><p>Keep a portable snapshot before clearing browser data or moving to another browser.</p><button class="btn btn-primary" data-backup-export>Download backup</button></article>
          <article class="panel backup-card"><span class="tag">Restore</span><h2>Import a copy</h2><p>Restoring replaces the current completed progress and simulator settings. In-progress sessions are not imported.</p><label class="btn backup-file">Choose backup<input type="file" accept="application/json,.json" data-backup-import></label></article>
        </section>
      </div>`;
  }

  function downloadProgressBackup() {
    const blob = new Blob([JSON.stringify(backupPayload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `archready-backup-${todayKey()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    backupCenter('Backup downloaded successfully.');
  }

  async function restoreProgressBackup(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { backupCenter('The selected backup is larger than 5 MB.', true); return; }
    try {
      const restored = parseBackup(await file.text());
      if (!window.confirm('Replace the current ArchReady progress with this backup?')) return;
      Object.keys(progress).forEach((key) => delete progress[key]);
      Object.assign(progress, restored.progress);
      const restoredSimulator = defaultSimulator();
      if (restored.simulator && typeof restored.simulator === 'object') {
        for (const key of Object.keys(restoredSimulator)) {
          if (['string', 'number', 'boolean'].includes(typeof restored.simulator[key])) restoredSimulator[key] = restored.simulator[key];
        }
      }
      simulator = restoredSimulator;
      saveProgress();
      saveSimulator();
      backupCenter('Progress restored successfully.');
    } catch (error) {
      backupCenter(error.message || 'The backup could not be restored.', true);
    }
  }

  function domainLab() {
    app.innerHTML = `
      <header class="site-header"><div class="brand">Arch<span>Ready</span></div><button class="btn" data-home>Back to dashboard</button></header>
      <div class="shell domain-shell">
        <section class="domain-hero panel"><div><div class="eyebrow">Specialized practice</div><h1>Domain Lab</h1><p class="subtext">Study the official SAA-C03 blueprint or focus on a broader AWS knowledge area.</p></div><div class="domain-total"><strong>${bank.length}</strong><span>classified questions</span></div></section>
        <section class="domain-section"><div class="section-heading"><div><div class="eyebrow">Official exam plan</div><h2>SAA-C03 domains</h2></div></div><div class="domain-grid">${examDomains.map((domain, index) => {
          const questions = bank.filter((question) => question.examDomain === domain);
          const module = summarizePool(questions);
          return `<article class="domain-card"><div class="domain-card-head"><span class="domain-number">${String(index + 1).padStart(2, '0')}</span><span class="tag">${examDomainWeights[domain]}% weight</span></div><h3>${escapeHTML(domain)}</h3><p>${module.completed}/${questions.length} completed · ${module.accuracy}% accuracy</p><div class="coverage-bar" aria-label="${module.coverage}% coverage"><i style="width:${module.coverage}%"></i></div><small class="coverage-label">${module.coverage}% question coverage</small><button class="btn btn-primary" data-exam-domain="${escapeHTML(domain)}">Practice domain</button></article>`;
        }).join('')}</div></section>
        <section class="domain-section"><div class="section-heading"><div><div class="eyebrow">Knowledge map</div><h2>Learning topics</h2></div></div><div class="domain-grid topic-grid">${topics.map((topic, index) => {
          const questions = bank.filter((question) => question.topic === topic);
          const module = summarizePool(questions);
          return `<article class="domain-card"><div class="domain-card-head"><span class="domain-number">${String(index + 1).padStart(2, '0')}</span><span class="tag">${questions.length} questions</span></div><h3>${escapeHTML(topic)}</h3><p>${module.completed ? `${module.completed}/${questions.length} completed · ${module.accuracy}% accuracy` : 'Fresh topic · ready when you are'}</p><div class="coverage-bar" aria-label="${module.coverage}% coverage"><i style="width:${module.coverage}%"></i></div><small class="coverage-label">${module.coverage}% question coverage</small><button class="btn" data-topic="${escapeHTML(topic)}">Practice topic</button></article>`;
        }).join('')}</div></section>
      </div>`;
  }

  function roadmapSummary() {
    const tasks = learning.roadmap.flatMap((phase) => phase.tasks.map(([id]) => id));
    const complete = tasks.filter((id) => progress.roadmapTasks[id]).length;
    return { total: tasks.length, complete, percent: tasks.length ? Math.round((complete / tasks.length) * 100) : 0 };
  }

  function learningRoadmap() {
    const summary = roadmapSummary();
    app.innerHTML = `
      <header class="site-header"><div class="brand">Arch<span>Ready</span></div><button class="btn" data-home>Back to dashboard</button></header>
      <div class="shell roadmap-shell">
        <section class="roadmap-hero panel"><div><div class="eyebrow">Twelve-week learning plan</div><h1>Your AWS roadmap</h1><p class="subtext">Move through connected concepts, build practical evidence, and use practice results to reinforce each stage.</p></div><div class="roadmap-score"><strong>${summary.percent}%</strong><span>${summary.complete} of ${summary.total} milestones complete</span></div></section>
        <section class="roadmap-progress" aria-label="Roadmap completion"><i style="width:${summary.percent}%"></i></section>
        <section class="roadmap-tree">${learning.roadmap.map((phase, index) => {
          const completed = phase.tasks.filter(([id]) => progress.roadmapTasks[id]).length;
          const percent = Math.round((completed / phase.tasks.length) * 100);
          return `<article class="roadmap-phase"><div class="roadmap-rail"><span>${String(index + 1).padStart(2, '0')}</span></div><div class="roadmap-content"><div class="roadmap-phase-head"><div><span class="eyebrow">${escapeHTML(phase.phase)} · ${escapeHTML(phase.weeks)}</span><h2>${escapeHTML(phase.title)}</h2><p class="subtext">${escapeHTML(phase.outcome)}</p></div><span class="tag">${completed}/${phase.tasks.length}</span></div><div class="roadmap-nodes">${phase.tasks.map(([id, label]) => `<button class="roadmap-node ${progress.roadmapTasks[id] ? 'done' : ''}" data-roadmap-task="${escapeHTML(id)}" aria-pressed="${Boolean(progress.roadmapTasks[id])}"><span>${progress.roadmapTasks[id] ? '✓' : ''}</span>${escapeHTML(label)}</button>`).join('')}</div><div class="roadmap-lab"><strong>Build checkpoint</strong><p>${escapeHTML(phase.lab)}</p><div>${phase.domains.map((domain) => `<span class="tag">${escapeHTML(domain)}</span>`).join('')}</div></div><div class="phase-progress"><i style="width:${percent}%"></i></div></div></article>`;
        }).join('')}</section>
      </div>`;
  }

  function serviceLab() {
    const available = services.filter((service) => (servicePools.get(service.id) || []).length);
    const linkedQuestions = new Set(available.flatMap((service) => servicePools.get(service.id).map((question) => question.id))).size;
    const categories = [...new Set(available.map((service) => service.category))].sort();
    app.innerHTML = `
      <header class="site-header"><div class="brand">Arch<span>Ready</span></div><button class="btn" data-home>Back to dashboard</button></header>
      <div class="shell service-shell">
        <section class="service-hero panel"><div><div class="eyebrow">Service-by-service learning</div><h1>Service Lab</h1><p class="subtext">Learn when to choose an AWS service, then practice questions that explicitly involve it.</p></div><div class="service-summary"><span><strong>${available.length}</strong> services</span><span><strong>${linkedQuestions}</strong> linked questions</span></div></section>
        <section class="service-controls panel"><div class="field"><label for="service-search">Find a service</label><input id="service-search" type="search" placeholder="Search S3, WAF, Lambda…" autocomplete="off"></div><div class="field"><label for="service-category">Category</label><select id="service-category"><option>All categories</option>${categories.map((category) => `<option>${escapeHTML(category)}</option>`).join('')}</select></div><span class="tag" id="service-result-count">${available.length} services</span></section>
        <section class="service-grid">${available.map((service) => {
          const questions = servicePools.get(service.id);
          const module = summarizePool(questions);
          const initials = service.name.replace(/^(Amazon|AWS)\s+/, '').split(/\s+/).map((word) => word[0]).join('').slice(0, 3);
          const searchText = `${service.name} ${service.aliases.join(' ')} ${service.description}`.toLowerCase();
          return `<article class="service-card" data-service-card data-search="${escapeHTML(searchText)}" data-category="${escapeHTML(service.category)}"><div class="service-card-head"><span class="service-mark">${escapeHTML(initials)}</span><span class="tag">${questions.length} questions</span></div><span class="service-category">${escapeHTML(service.category)}</span><h3>${escapeHTML(service.name)}</h3><p>${escapeHTML(service.description)}</p><div class="coverage-bar" aria-label="${module.coverage}% coverage"><i style="width:${module.coverage}%"></i></div><small class="coverage-label">${module.completed}/${questions.length} completed · ${module.accuracy}% accuracy</small><div class="service-use"><strong>Choose it for</strong>${escapeHTML(service.use)}</div><button class="btn btn-primary" data-service="${escapeHTML(service.id)}">Practice service</button></article>`;
        }).join('')}</section>
      </div>`;
  }

  function simulatorStageLabel(stage) {
    return ({ brief: 'Project brief', network: 'Network', security: 'Security', compute: 'Compute', review: 'Review' })[stage] || 'Project brief';
  }

  function simulatorAssessment() {
    const findings = [];
    if (!simulator.natGateway || simulator.natGateway === 'false') findings.push(['risk', 'Private workloads have no general outbound path. Add required VPC endpoints or a NAT Gateway.']);
    if (!simulator.waf) findings.push(['risk', 'The public HTTP entry point has no AWS WAF protection.']);
    if (!simulator.sessionManager) findings.push(['risk', 'Use Session Manager to avoid public administrative access.']);
    if (Number(simulator.minInstances) < 2 && simulator.environment === 'production') findings.push(['risk', 'Production workloads should use at least two instances across Availability Zones.']);
    if (!findings.length) findings.push(['good', 'The selected baseline keeps workloads private, provides auditable access, and includes layered public-entry protection.']);
    const instanceRate = simulator.ec2Size === 't3.medium' ? 0.0416 : simulator.ec2Size === 't3.micro' ? 0.0104 : 0.0208;
    const instances = Math.max(1, Number(simulator.minInstances) || 1);
    const monthly = (instanceRate * instances * 730) + ((simulator.natGateway === true || simulator.natGateway === 'true') ? 32.85 : 0) + (simulator.waf ? 8 : 0) + (simulator.lambda ? (Number(simulator.monthlyRequests) || 0) * 3.7 : 0);
    return { findings, monthly: Math.round(monthly * 100) / 100 };
  }

  function simulatorShell(content) {
    const stages = ['brief', 'network', 'security', 'compute', 'review'];
    return `<header class="site-header"><div class="brand">Arch<span>Ready</span></div><button class="btn" data-home>Exit simulator</button></header><div class="sim-shell"><aside class="sim-side"><div class="eyebrow">Guided capstone</div><h2>Architecture simulator</h2><p>Design a safe, illustrative AWS workload. Nothing is deployed to AWS.</p><div class="sim-stages">${stages.map((stage, index) => `<button class="sim-stage ${simulator.stage === stage ? 'active' : ''}" data-sim-stage="${stage}"><span>${index + 1}</span>${simulatorStageLabel(stage)}</button>`).join('')}</div></aside><main class="sim-main">${content}</main></div>`;
  }

  function architectureSimulator() {
    const stage = simulator.stage;
    let content = '';
    if (stage === 'brief') content = `<section class="sim-card"><div class="eyebrow">Step 1 · Define the workload</div><h1>Start with the architecture brief.</h1><p class="subtext">Set the constraints before choosing services. The simulator will use these assumptions in later design checks.</p><div class="sim-form"><label>Project name<input data-sim-field="projectName" value="${escapeHTML(simulator.projectName)}"></label><label>Region<select data-sim-field="region"><option value="ap-northeast-1" ${simulator.region === 'ap-northeast-1' ? 'selected' : ''}>Asia Pacific (Tokyo)</option><option value="us-east-1" ${simulator.region === 'us-east-1' ? 'selected' : ''}>US East (N. Virginia)</option><option value="eu-west-1" ${simulator.region === 'eu-west-1' ? 'selected' : ''}>Europe (Ireland)</option></select></label><label>Environment<select data-sim-field="environment"><option value="development" ${simulator.environment === 'development' ? 'selected' : ''}>Development</option><option value="production" ${simulator.environment === 'production' ? 'selected' : ''}>Production</option></select></label><label>Traffic pattern<select data-sim-field="traffic"><option value="steady" ${simulator.traffic === 'steady' ? 'selected' : ''}>Steady customer traffic</option><option value="spiky" ${simulator.traffic === 'spiky' ? 'selected' : ''}>Spiky campaign traffic</option></select></label><label>Data sensitivity<select data-sim-field="dataSensitivity"><option value="standard" ${simulator.dataSensitivity === 'standard' ? 'selected' : ''}>Standard customer data</option><option value="sensitive" ${simulator.dataSensitivity === 'sensitive' ? 'selected' : ''}>Sensitive regulated data</option></select></label></div><button class="btn btn-primary" data-sim-stage="network">Design network</button></section>`;
    else if (stage === 'network') content = `<section class="sim-card"><div class="eyebrow">Step 2 · Network boundaries</div><h1>Segment public entry from private workloads.</h1><p class="subtext">A two-AZ baseline keeps application and data resources out of the public subnet while still allowing controlled egress.</p><div class="sim-form"><label>VPC CIDR<input data-sim-field="vpcCidr" value="${escapeHTML(simulator.vpcCidr)}"></label><label>Public subnet CIDR<input data-sim-field="publicSubnet" value="${escapeHTML(simulator.publicSubnet)}"></label><label>Private subnet CIDR<input data-sim-field="privateSubnet" value="${escapeHTML(simulator.privateSubnet)}"></label><label>Private outbound access<select data-sim-field="natGateway"><option value="true" ${simulator.natGateway === true || simulator.natGateway === 'true' ? 'selected' : ''}>NAT Gateway</option><option value="false" ${simulator.natGateway === false || simulator.natGateway === 'false' ? 'selected' : ''}>No general internet egress</option></select></label></div><section class="sim-callout"><strong>Design cue</strong><p>Use public subnets for the load balancer only. Application instances and data services should use private subnets.</p></section><button class="btn btn-primary" data-sim-stage="security">Configure security</button></section>`;
    else if (stage === 'security') content = `<section class="sim-card"><div class="eyebrow">Step 3 · Security and access</div><h1>Layer controls to match the workload.</h1><p class="subtext">Choose web protection, auditable operations access, and network visibility. These are simulated settings only.</p><div class="sim-choice-grid"><label class="sim-choice"><input type="checkbox" data-sim-check="waf" ${simulator.waf ? 'checked' : ''}><span><strong>AWS WAF on public entry</strong><small>Filter common web exploits and abusive HTTP requests.</small></span></label><label class="sim-choice"><input type="checkbox" data-sim-check="sessionManager" ${simulator.sessionManager ? 'checked' : ''}><span><strong>Systems Manager Session Manager</strong><small>Manage instances without opening SSH to the internet.</small></span></label><label class="sim-choice"><input type="checkbox" data-sim-check="flowLogs" ${simulator.flowLogs ? 'checked' : ''}><span><strong>VPC Flow Logs</strong><small>Record accepted and rejected network flows for review.</small></span></label></div><section class="sim-callout"><strong>Design cue</strong><p>Security groups protect resources; WAF protects the HTTP entry point. They solve different problems and commonly work together.</p></section><button class="btn btn-primary" data-sim-stage="compute">Configure compute</button></section>`;
    else if (stage === 'compute') content = `<section class="sim-card"><div class="eyebrow">Step 4 · Compute and data</div><h1>Scale the application tier deliberately.</h1><p class="subtext">Choose a small resilient baseline, then let the simulated traffic pattern guide the scaling range.</p><div class="sim-form"><label>EC2 instance size<select data-sim-field="ec2Size"><option value="t3.micro" ${simulator.ec2Size === 't3.micro' ? 'selected' : ''}>t3.micro</option><option value="t3.small" ${simulator.ec2Size === 't3.small' ? 'selected' : ''}>t3.small</option><option value="t3.medium" ${simulator.ec2Size === 't3.medium' ? 'selected' : ''}>t3.medium</option></select></label><label>Minimum instances<input type="number" min="1" max="10" data-sim-field="minInstances" value="${escapeHTML(simulator.minInstances)}"></label><label>Maximum instances<input type="number" min="1" max="20" data-sim-field="maxInstances" value="${escapeHTML(simulator.maxInstances)}"></label><label>Monthly API requests (millions)<input type="number" min="0" step="0.1" data-sim-field="monthlyRequests" value="${escapeHTML(simulator.monthlyRequests)}"></label></div><div class="sim-choice-grid"><label class="sim-choice"><input type="checkbox" data-sim-check="lambda" ${simulator.lambda ? 'checked' : ''}><span><strong>API Gateway + Lambda</strong><small>Use a serverless API tier for request handling.</small></span></label><label class="sim-choice"><input type="checkbox" data-sim-check="dynamo" ${simulator.dynamo ? 'checked' : ''}><span><strong>DynamoDB application data</strong><small>Use a managed, scalable data store for the simulated application.</small></span></label></div><button class="btn btn-primary" data-sim-stage="review">Review architecture</button></section>`;
    else { const assessment = simulatorAssessment(); content = `<section class="sim-card"><div class="eyebrow">Step 5 · Review and estimate</div><h1>${escapeHTML(simulator.projectName)}</h1><p class="subtext">Educational design review and illustrative estimate only. This does not deploy or price real AWS resources.</p><div class="sim-diagram"><div>Internet<br><small>Customers</small></div><span>→</span><div>${simulator.waf ? 'AWS WAF + ' : ''}Load balancer</div><span>→</span><div>Private EC2<br><small>${escapeHTML(simulator.ec2Size)} × ${escapeHTML(simulator.minInstances)}–${escapeHTML(simulator.maxInstances)}</small></div><span>→</span><div>${simulator.lambda ? 'Lambda + ' : ''}${simulator.dynamo ? 'DynamoDB' : 'Application data'}</div></div><div class="sim-review-grid"><section><h3>Design checks</h3>${assessment.findings.map(([type, text]) => `<p class="sim-finding ${type}">${escapeHTML(text)}</p>`).join('')}</section><section class="sim-cost"><span>Illustrative monthly estimate</span><strong>$${assessment.monthly.toFixed(2)}</strong><small>EC2 baseline, optional NAT Gateway, WAF, and request assumptions only.</small></section></div><div class="actions"><button class="btn" data-sim-stage="brief">Edit brief</button><button class="btn btn-primary" data-sim-reset>Start a new design</button></div></section>`; }
    app.innerHTML = simulatorShell(content);
  }

  function filterServices() {
    const query = (document.querySelector('#service-search')?.value || '').trim().toLowerCase();
    const category = document.querySelector('#service-category')?.value || 'All categories';
    const cards = [...document.querySelectorAll('[data-service-card]')];
    let visible = 0;
    for (const card of cards) {
      const matchesQuery = !query || card.dataset.search.includes(query);
      const matchesCategory = category === 'All categories' || card.dataset.category === category;
      card.hidden = !(matchesQuery && matchesCategory);
      if (!card.hidden) visible += 1;
    }
    const count = document.querySelector('#service-result-count');
    if (count) count.textContent = `${visible} service${visible === 1 ? '' : 's'}`;
  }

  function start(mode, focus = {}) {
    const requested = Number(document.querySelector('#custom-count')?.value) || 20;
    const source = mode === 'review'
      ? weakQuestionPool()
      : mode === 'domain'
        ? bank.filter((question) => question.examDomain === focus.examDomain)
      : mode === 'topic'
          ? bank.filter((question) => question.topic === focus.topic)
          : mode === 'service'
            ? servicePools.get(focus.serviceId) || []
          : bank;
    const count = mode === 'mock'
      ? Math.min(65, bank.length)
      : mode === 'review'
        ? Math.min(15, source.length)
      : mode === 'domain'
        ? Math.min(20, source.length)
      : mode === 'topic'
        ? Math.min(15, source.length)
      : mode === 'service'
        ? Math.min(15, source.length)
      : mode === 'custom'
        ? Math.min(Math.max(requested, 5), 65, bank.length)
        : Math.min(10, bank.length);
    const questions = shuffle(source, Date.now()).slice(0, count).map((question) => ({
      ...question,
      options: optionsFor(question),
      selected: [],
      submitted: false
    }));
    session = {
      mode,
      focus,
      title: focus.examDomain || focus.topic || focus.serviceName || modeTitle(mode),
      questions,
      index: 0,
      flagged: [],
      remaining: mode === 'mock' ? 130 * 60 : null,
      deadlineAt: mode === 'mock' ? Date.now() + (130 * 60 * 1000) : null,
      startedAt: Date.now()
    };
    renderExam();
    saveActiveSession();
    if (session.remaining !== null) startTimer();
  }

  function renderExam() {
    const question = session.questions[session.index];
    const required = Math.max(1, Number(question.selectionsRequired) || 1);
    const showFeedback = session.mode !== 'mock' && question.submitted;
    const correct = isCorrect(question);
    app.innerHTML = `
      <header class="exam-header">
        <div class="brand">Arch<span>Ready</span></div>
        <div class="exam-progress-label">${escapeHTML(session.title)} · Question ${session.index + 1} of ${session.questions.length}</div>
        ${session.remaining === null ? '<span></span>' : `<div class="timer ${session.remaining < 600 ? 'warning' : ''}" data-timer>${formatTime(session.remaining)}</div>`}
      </header>
      <div class="exam-layout">
        <article class="question-card">
          <div class="question-meta"><div><span class="tag">${escapeHTML(question.category || 'AWS')}</span> <span class="tag">Choose ${required}</span></div><button class="flag ${session.flagged.includes(session.index) ? 'active' : ''}" data-flag aria-keyshortcuts="F">${session.flagged.includes(session.index) ? 'Flagged' : 'Flag for review'}</button></div>
          <div class="question-text">${escapeHTML(question.question)}</div>
          <div class="options">${question.options.map((option, index) => `
            <button class="option ${question.selected.includes(index) ? 'selected' : ''} ${showFeedback && option.correct ? 'correct' : ''} ${showFeedback && question.selected.includes(index) && !option.correct ? 'incorrect' : ''}" data-option="${index}" aria-keyshortcuts="${index + 1}" ${showFeedback ? 'disabled' : ''}>
              <span class="option-key">${String.fromCharCode(65 + index)}</span><span>${escapeHTML(option.text)}</span>
            </button>`).join('')}</div>
          ${showFeedback ? `<section class="feedback ${correct ? '' : 'wrong'}" role="status"><strong>${correct ? 'Correct' : 'Not quite'}</strong><p>${escapeHTML(question.explanation || `The supplied answer is: ${answerParts(question).join('; ')}`)}</p></section>` : ''}
          <div class="question-actions">
            <button class="btn" data-previous aria-keyshortcuts="ArrowLeft" ${session.index === 0 ? 'disabled' : ''}>Previous</button>
            ${session.mode !== 'mock' && !question.submitted
              ? `<button class="btn btn-primary" data-check ${question.selected.length !== required ? 'disabled' : ''}>Check answer</button>`
              : `<button class="btn btn-primary" data-next ${session.index === session.questions.length - 1 ? '' : 'aria-keyshortcuts="ArrowRight"'}>${session.index === session.questions.length - 1 ? 'Submit exam' : 'Next question'}</button>`}
          </div>
        </article>
        <aside class="navigator">
          <h3>Question navigator</h3>
          <p class="subtext">Jump to any question or revisit flagged items.</p>
          <div class="exam-shortcuts" aria-label="Keyboard shortcuts"><span><kbd>1–5</kbd> answer</span><span><kbd>←</kbd><kbd>→</kbd> navigate</span><span><kbd>F</kbd> flag</span></div>
          <div class="nav-grid">${session.questions.map((item, index) => `<button class="q-dot ${index === session.index ? 'current' : ''} ${item.selected.length ? 'answered' : ''} ${session.flagged.includes(index) ? 'flagged' : ''}" data-jump="${index}" aria-label="Question ${index + 1}">${index + 1}</button>`).join('')}</div>
          <button class="btn btn-danger" data-submit>Submit session</button>
        </aside>
      </div>`;
  }

  function selectOption(index) {
    const question = session.questions[session.index];
    if (question.submitted) return;
    const required = Math.max(1, Number(question.selectionsRequired) || 1);
    if (question.selected.includes(index)) {
      question.selected = question.selected.filter((value) => value !== index);
    } else if (required === 1) {
      question.selected = [index];
    } else if (question.selected.length < required) {
      question.selected = [...question.selected, index];
    }
    renderExam();
    saveActiveSession();
  }

  function isCorrect(question) {
    const expected = question.options.map((option, index) => option.correct ? index : -1).filter((index) => index >= 0);
    return expected.length === question.selected.length && expected.every((index) => question.selected.includes(index));
  }

  function questionStatus(question) {
    if (!question.selected.length) return 'unanswered';
    return isCorrect(question) ? 'correct' : 'incorrect';
  }

  function recordAttempt() {
    const completedAt = Date.now();
    const duration = Math.max(0, Math.round((completedAt - session.startedAt) / 1000));
    const attempt = {
      id: `${completedAt}-${Math.random().toString(36).slice(2, 8)}`,
      mode: session.mode,
      title: session.title,
      focus: session.focus,
      completedAt,
      duration,
      total: session.questions.length,
      ...session.result,
      results: session.questions.map((question) => ({
        qid: question.id,
        category: question.category || 'AWS',
        correct: isCorrect(question),
        answered: question.selected.length > 0
      }))
    };

    progress.attempts.unshift(attempt);
    progress.attempts = progress.attempts.slice(0, 100);
    progress.totalSeconds += duration;
    progress.studyDates = [...new Set([...progress.studyDates, todayKey()])].slice(-365);
    for (const result of attempt.results) {
      if (!result.answered) continue;
      const stat = progress.stats[result.qid] || { attempts: 0, correct: 0, category: result.category };
      stat.attempts += 1;
      stat.correct += result.correct ? 1 : 0;
      stat.lastAttemptedAt = completedAt;
      progress.stats[result.qid] = stat;
    }
    saveProgress();
  }

  function finish(force = false) {
    const unanswered = session.questions.filter((question) => !question.selected.length).length;
    if (!force && unanswered && !window.confirm(`${unanswered} question${unanswered === 1 ? '' : 's'} remain unanswered. Submit anyway?`)) return;
    stopTimer();
    const answered = session.questions.filter((question) => question.selected.length).length;
    if (!answered) {
      clearActiveSession();
      renderIncomplete();
      return;
    }
    const correct = session.questions.filter(isCorrect).length;
    const score = Math.round((correct / session.questions.length) * 100);
    session.result = { answered, correct, score };
    recordAttempt();
    clearActiveSession();
    renderResults();
  }

  function renderIncomplete() {
    app.innerHTML = `
      <header class="site-header"><div class="brand">Arch<span>Ready</span></div></header>
      <div class="shell"><section class="panel">
        <div class="eyebrow">Session incomplete</div><h1>No result recorded.</h1>
        <p class="subtext">At least one answered question is required before a session can affect history, accuracy, or readiness.</p>
        <div class="actions"><button class="btn btn-primary" data-home>Return home</button><button class="btn" data-restart>Try again</button></div>
      </section></div>`;
  }

  function renderResults() {
    const { answered, correct, score } = session.result;
    app.innerHTML = `
      <header class="site-header"><div class="brand">Arch<span>Ready</span></div></header>
      <div class="shell"><section class="panel">
        <div class="eyebrow">Session complete</div><h1>${score}%</h1>
        <p class="subtext">Your ${escapeHTML(session.title.toLowerCase())} session has been scored.</p>
        <div class="summary"><div><strong>${correct}</strong><span>Correct</span></div><div><strong>${answered}</strong><span>Answered</span></div><div><strong>${session.questions.length - answered}</strong><span>Unanswered</span></div></div>
        <div class="actions"><button class="btn btn-primary" data-review="incorrect">Review missed answers</button><button class="btn" data-review="all">Review all</button><button class="btn" data-home>Return home</button><button class="btn" data-restart>Try another session</button></div>
      </section></div>`;
  }

  function renderReview(filter = 'all') {
    const totals = session.questions.reduce((counts, question, index) => {
      counts[questionStatus(question)] += 1;
      if (session.flagged.includes(index)) counts.flagged += 1;
      return counts;
    }, { correct: 0, incorrect: 0, unanswered: 0, flagged: 0 });
    const questions = session.questions
      .map((question, index) => ({ question, index, status: questionStatus(question) }))
      .filter((item) => filter === 'all' || item.status === filter || (filter === 'flagged' && session.flagged.includes(item.index)));
    app.innerHTML = `
      <header class="site-header"><div class="brand">Arch<span>Ready</span></div><button class="btn" data-results>Back to results</button></header>
      <div class="shell review-shell">
        <section class="review-heading">
          <div><div class="eyebrow">Answer review</div><h2>Understand every decision.</h2><p class="subtext">Compare your selections with the supplied answer and explanation.</p></div>
          <div class="review-filters" aria-label="Filter reviewed questions">
            <button class="btn ${filter === 'all' ? 'btn-primary' : ''}" data-review="all" aria-pressed="${filter === 'all'}">All ${session.questions.length}</button>
            <button class="btn ${filter === 'correct' ? 'btn-primary' : ''}" data-review="correct" aria-pressed="${filter === 'correct'}">Correct ${totals.correct}</button>
            <button class="btn ${filter === 'incorrect' ? 'btn-primary' : ''}" data-review="incorrect" aria-pressed="${filter === 'incorrect'}">Incorrect ${totals.incorrect}</button>
            <button class="btn ${filter === 'unanswered' ? 'btn-primary' : ''}" data-review="unanswered" aria-pressed="${filter === 'unanswered'}">Unanswered ${totals.unanswered}</button>
            <button class="btn ${filter === 'flagged' ? 'btn-primary' : ''}" data-review="flagged" aria-pressed="${filter === 'flagged'}">Flagged ${totals.flagged}</button>
          </div>
        </section>
        <section class="review-totals" aria-label="Review totals"><span><strong>${totals.correct}</strong> correct</span><span><strong>${totals.incorrect}</strong> incorrect</span><span><strong>${totals.unanswered}</strong> unanswered</span><span><strong>${totals.flagged}</strong> flagged</span></section>
        <div class="review-list">${questions.length ? questions.map(({ question, index, status }) => {
          const selected = question.selected.map((selectedIndex) => question.options[selectedIndex]?.text).filter(Boolean);
          return `<article class="review-card ${status}">
            <div class="review-card-head"><span class="tag">Question ${index + 1}</span><span class="result-badge ${status}">${status}</span></div>
            <h3>${escapeHTML(question.question)}</h3>
            <div class="answer-comparison">
              <div><span>Your answer</span><p>${selected.length ? selected.map(escapeHTML).join('<br>') : 'No answer selected'}</p></div>
              <div><span>Correct answer</span><p>${answerParts(question).map(escapeHTML).join('<br>')}</p></div>
            </div>
            <div class="review-explanation"><strong>Why</strong><p>${escapeHTML(question.explanation || 'No detailed explanation was supplied for this question.')}</p></div>
          </article>`;
        }).join('') : '<div class="panel"><p class="subtext">No questions match this filter.</p></div>'}</div>
      </div>`;
  }

  function startTimer() {
    stopTimer();
    timerId = window.setInterval(() => {
      session.remaining = Math.max(0, Math.ceil((session.deadlineAt - Date.now()) / 1000));
      const timer = document.querySelector('[data-timer]');
      if (timer) {
        timer.textContent = formatTime(session.remaining);
        timer.classList.toggle('warning', session.remaining < 600);
      }
      if (session.remaining <= 0) finish(true);
      else if (session.remaining % 15 === 0) saveActiveSession();
    }, 1000);
  }

  function stopTimer() {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
  }

  app.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.hasAttribute('data-theme-toggle')) setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    if (target.dataset.start) start(target.dataset.start);
    if (target.hasAttribute('data-resume')) resumeSession();
    if (target.hasAttribute('data-discard-session')) { clearActiveSession(); home(); }
    if (target.dataset.route === 'domains') domainLab();
    if (target.dataset.route === 'services') serviceLab();
    if (target.dataset.route === 'simulator') architectureSimulator();
    if (target.dataset.route === 'history') sessionHistory();
    if (target.dataset.route === 'backup') backupCenter();
    if (target.dataset.simStage) { simulator.stage = target.dataset.simStage; saveSimulator(); architectureSimulator(); }
    if (target.hasAttribute('data-sim-reset')) { simulator = defaultSimulator(); saveSimulator(); architectureSimulator(); }
    if (target.dataset.route === 'roadmap') learningRoadmap();
    if (target.dataset.examDomain) start('domain', { examDomain: target.dataset.examDomain });
    if (target.dataset.topic) start('topic', { topic: target.dataset.topic });
    if (target.dataset.service) {
      const service = services.find((item) => item.id === target.dataset.service);
      if (service) start('service', { serviceId: service.id, serviceName: service.name });
    }
    if (target.dataset.roadmapTask) {
      const id = target.dataset.roadmapTask;
      progress.roadmapTasks[id] = !progress.roadmapTasks[id];
      saveProgress();
      learningRoadmap();
    }
    if (target.dataset.option !== undefined) selectOption(Number(target.dataset.option));
    if (target.hasAttribute('data-check')) {
      session.questions[session.index].submitted = true;
      renderExam();
      saveActiveSession();
    }
    if (target.dataset.jump !== undefined) { session.index = Number(target.dataset.jump); renderExam(); saveActiveSession(); }
    if (target.hasAttribute('data-flag')) {
      session.flagged = session.flagged.includes(session.index)
        ? session.flagged.filter((index) => index !== session.index)
        : [...session.flagged, session.index];
      renderExam();
      saveActiveSession();
    }
    if (target.hasAttribute('data-previous') && session.index > 0) { session.index -= 1; renderExam(); saveActiveSession(); }
    if (target.hasAttribute('data-next')) {
      if (session.index === session.questions.length - 1) finish();
      else { session.index += 1; renderExam(); saveActiveSession(); }
    }
    if (target.hasAttribute('data-submit')) finish();
    if (target.hasAttribute('data-backup-export')) downloadProgressBackup();
    if (target.dataset.review) renderReview(target.dataset.review);
    if (target.dataset.historyFilter) sessionHistory(target.dataset.historyFilter);
    if (target.hasAttribute('data-results')) renderResults();
    if (target.hasAttribute('data-home')) home();
    if (target.hasAttribute('data-restart')) start(session.mode, session.focus);
  });

  app.addEventListener('input', (event) => {
    if (event.target.matches('#service-search')) filterServices();
    if (event.target.matches('[data-sim-field]')) { simulator[event.target.dataset.simField] = event.target.value; saveSimulator(); }
    if (event.target.matches('[data-sim-check]')) { simulator[event.target.dataset.simCheck] = event.target.checked; saveSimulator(); }
  });

  app.addEventListener('change', (event) => {
    if (event.target.matches('#service-category')) filterServices();
    if (event.target.matches('[data-sim-field]')) { simulator[event.target.dataset.simField] = event.target.value; saveSimulator(); }
    if (event.target.matches('[data-backup-import]')) restoreProgressBackup(event.target.files?.[0]);
  });

  window.addEventListener('keydown', (event) => {
    if (!session || !document.querySelector('.exam-layout') || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.matches('input, select, textarea, [contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (/^[1-5]$/.test(key)) {
      const option = document.querySelector(`[data-option="${Number(key) - 1}"]:not(:disabled)`);
      if (option) { event.preventDefault(); option.click(); }
      return;
    }
    if (key === 'f') {
      event.preventDefault();
      document.querySelector('[data-flag]')?.click();
      return;
    }
    if (event.key === 'ArrowLeft' && session.index > 0) {
      event.preventDefault();
      document.querySelector('[data-previous]')?.click();
    }
    if (event.key === 'ArrowRight' && session.index < session.questions.length - 1) {
      event.preventDefault();
      document.querySelector('[data-next]')?.click();
    }
  });

  window.addEventListener('pagehide', saveActiveSession);

  window.addEventListener('archready-cloud-status', (event) => {
    cloudState = event.detail || cloudState;
    refreshCloudBadge();
  });

  if (window.MutationObserver) new MutationObserver(mountThemeToggle).observe(app, { childList: true, subtree: true });

  async function initializeCloud() {
    if (!window.CloudProgress?.configured()) return;
    try {
      const authenticated = await window.CloudProgress.init();
      if (!authenticated) return;
      const remote = await window.CloudProgress.load();
      if (remote && typeof remote === 'object') {
        Object.assign(progress, remote);
        saveProgress(false);
      }
      if (!session) home();
    } catch (error) {
      cloudState = { state: 'error', message: error.message || 'Cloud synchronization failed' };
      refreshCloudBadge();
    }
  }

  home();
  mountThemeToggle();
  initializeCloud();
})();
