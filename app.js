(() => {
  'use strict';

  const bank = (window.AWS_QUESTION_BANK || []).filter((question) =>
    question.question?.trim().length >= 8 && question.answer
  );
  const storeKey = 'archready-progress-v1';
  const examDomainWeights = {
    'Design Secure Architectures': 30,
    'Design Resilient Architectures': 26,
    'Design High-Performing Architectures': 24,
    'Design Cost-Optimized Architectures': 20
  };
  const topics = [...new Set(bank.map((question) => question.topic).filter(Boolean))].sort();
  const examDomains = Object.keys(examDomainWeights).filter((domain) => bank.some((question) => question.examDomain === domain));
  const app = document.querySelector('#app');
  let timerId = null;
  let session = null;

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
      return {
        attempts: Array.isArray(saved.attempts) ? saved.attempts : [],
        stats: saved.stats && typeof saved.stats === 'object' ? saved.stats : {},
        totalSeconds: Number(saved.totalSeconds) || 0,
        studyDates: Array.isArray(saved.studyDates) ? saved.studyDates : []
      };
    } catch {
      return { attempts: [], stats: {}, totalSeconds: 0, studyDates: [] };
    }
  }

  const progress = loadProgress();

  function saveProgress() {
    try { localStorage.setItem(storeKey, JSON.stringify(progress)); } catch { /* Browser storage can be unavailable. */ }
  }

  function todayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

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

  function modeTitle(mode) {
    if (mode === 'mock') return 'Full mock exam';
    if (mode === 'review') return 'Weak-area drill';
    if (mode === 'domain') return 'Exam domain practice';
    if (mode === 'topic') return 'Topic practice';
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

  function home() {
    stopTimer();
    session = null;
    const summary = progressSummary();
    const readiness = readinessSummary();
    app.innerHTML = `
      <header class="site-header"><div class="brand">Arch<span>Ready</span></div><span class="tag">${bank.length} questions</span></header>
      <div class="shell hero">
        <section class="panel">
          <div class="eyebrow">AWS Solutions Architect Associate</div>
          <h1>Practice the decision, not the guess.</h1>
          <p class="subtext">Build exam stamina with focused practice or a complete 65-question, 130-minute simulation.</p>
          <div class="actions"><button class="btn btn-primary" data-start="practice">Start quick practice</button><button class="btn" data-route="domains">Explore domains</button><button class="btn" data-start="review">Train weak areas</button><button class="btn" data-start="mock">Take full mock</button></div>
        </section>
        <aside class="panel session-options">
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
        <section class="panel readiness-panel">
          <div class="readiness-ring" style="--readiness:${readiness.score}" aria-label="Learning readiness ${readiness.score} percent"><strong>${readiness.score}%</strong><span>learning score</span></div>
          <div><div class="eyebrow">Readiness evidence</div><h2>${readiness.examReady ? 'You are exam-ready.' : 'Build repeatable mock results.'}</h2><p class="subtext">${readiness.examReady ? `${readiness.qualifyingMocks} of your latest ${readiness.gateCount} full mocks reached 85% or higher.` : `Exam-ready status requires at least 3 of the latest 4 full mocks at 85% or higher. You currently have ${readiness.qualifyingMocks} qualifying result${readiness.qualifyingMocks === 1 ? '' : 's'}.`}</p><div class="readiness-signals"><span>Accuracy <strong>${summary.accuracy}%</strong></span><span>Mock average <strong>${readiness.mockAverage}%</strong></span><span>Coverage <strong>${readiness.coverage}%</strong></span></div></div>
          <button class="btn btn-primary" data-start="mock">Take a full mock</button>
        </section>
        <section class="panel recent-panel">
          <div class="section-heading"><div><div class="eyebrow">Recent activity</div><h2>Your latest sessions</h2></div></div>
          ${progress.attempts.length ? `<div class="activity-list">${progress.attempts.slice(0, 5).map((attempt) => `<div class="activity-item"><span class="activity-score">${attempt.score}%</span><div><strong>${escapeHTML(attempt.title || modeTitle(attempt.mode))}</strong><small>${formatDate(attempt.completedAt)} · ${attempt.total} questions · ${formatDuration(attempt.duration)}</small></div><span class="tag">${attempt.correct}/${attempt.total}</span></div>`).join('')}</div>` : '<div class="empty-progress"><strong>No sessions yet</strong><p class="subtext">Complete a practice set to start building your learning history.</p></div>'}
        </section>
      </div>`;
  }

  function domainLab() {
    app.innerHTML = `
      <header class="site-header"><div class="brand">Arch<span>Ready</span></div><button class="btn" data-home>Back to dashboard</button></header>
      <div class="shell domain-shell">
        <section class="domain-hero panel"><div><div class="eyebrow">Specialized practice</div><h1>Domain Lab</h1><p class="subtext">Study the official SAA-C03 blueprint or focus on a broader AWS knowledge area.</p></div><div class="domain-total"><strong>${bank.length}</strong><span>classified questions</span></div></section>
        <section class="domain-section"><div class="section-heading"><div><div class="eyebrow">Official exam plan</div><h2>SAA-C03 domains</h2></div></div><div class="domain-grid">${examDomains.map((domain, index) => {
          const count = bank.filter((question) => question.examDomain === domain).length;
          return `<article class="domain-card"><div class="domain-card-head"><span class="domain-number">${String(index + 1).padStart(2, '0')}</span><span class="tag">${examDomainWeights[domain]}% weight</span></div><h3>${escapeHTML(domain)}</h3><p>${count} questions aligned to this exam objective.</p><button class="btn btn-primary" data-exam-domain="${escapeHTML(domain)}">Practice domain</button></article>`;
        }).join('')}</div></section>
        <section class="domain-section"><div class="section-heading"><div><div class="eyebrow">Knowledge map</div><h2>Learning topics</h2></div></div><div class="domain-grid topic-grid">${topics.map((topic, index) => {
          const count = bank.filter((question) => question.topic === topic).length;
          return `<article class="domain-card"><div class="domain-card-head"><span class="domain-number">${String(index + 1).padStart(2, '0')}</span><span class="tag">${count} questions</span></div><h3>${escapeHTML(topic)}</h3><p>Focused practice for this AWS decision area.</p><button class="btn" data-topic="${escapeHTML(topic)}">Practice topic</button></article>`;
        }).join('')}</div></section>
      </div>`;
  }

  function start(mode, focus = {}) {
    const requested = Number(document.querySelector('#custom-count')?.value) || 20;
    const source = mode === 'review'
      ? weakQuestionPool()
      : mode === 'domain'
        ? bank.filter((question) => question.examDomain === focus.examDomain)
        : mode === 'topic'
          ? bank.filter((question) => question.topic === focus.topic)
          : bank;
    const count = mode === 'mock'
      ? Math.min(65, bank.length)
      : mode === 'review'
        ? Math.min(15, source.length)
      : mode === 'domain'
        ? Math.min(20, source.length)
      : mode === 'topic'
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
      title: focus.examDomain || focus.topic || modeTitle(mode),
      questions,
      index: 0,
      flagged: [],
      remaining: mode === 'mock' ? 130 * 60 : null,
      startedAt: Date.now()
    };
    renderExam();
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
          <div class="question-meta"><div><span class="tag">${escapeHTML(question.category || 'AWS')}</span> <span class="tag">Choose ${required}</span></div><button class="flag ${session.flagged.includes(session.index) ? 'active' : ''}" data-flag>${session.flagged.includes(session.index) ? 'Flagged' : 'Flag for review'}</button></div>
          <div class="question-text">${escapeHTML(question.question)}</div>
          <div class="options">${question.options.map((option, index) => `
            <button class="option ${question.selected.includes(index) ? 'selected' : ''} ${showFeedback && option.correct ? 'correct' : ''} ${showFeedback && question.selected.includes(index) && !option.correct ? 'incorrect' : ''}" data-option="${index}" ${showFeedback ? 'disabled' : ''}>
              <span class="option-key">${String.fromCharCode(65 + index)}</span><span>${escapeHTML(option.text)}</span>
            </button>`).join('')}</div>
          ${showFeedback ? `<section class="feedback ${correct ? '' : 'wrong'}" role="status"><strong>${correct ? 'Correct' : 'Not quite'}</strong><p>${escapeHTML(question.explanation || `The supplied answer is: ${answerParts(question).join('; ')}`)}</p></section>` : ''}
          <div class="question-actions">
            <button class="btn" data-previous ${session.index === 0 ? 'disabled' : ''}>Previous</button>
            ${session.mode !== 'mock' && !question.submitted
              ? `<button class="btn btn-primary" data-check ${question.selected.length !== required ? 'disabled' : ''}>Check answer</button>`
              : `<button class="btn btn-primary" data-next>${session.index === session.questions.length - 1 ? 'Submit exam' : 'Next question'}</button>`}
          </div>
        </article>
        <aside class="navigator">
          <h3>Question navigator</h3>
          <p class="subtext">Jump to any question or revisit flagged items.</p>
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
      renderIncomplete();
      return;
    }
    const correct = session.questions.filter(isCorrect).length;
    const score = Math.round((correct / session.questions.length) * 100);
    session.result = { answered, correct, score };
    recordAttempt();
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
      session.remaining -= 1;
      const timer = document.querySelector('[data-timer]');
      if (timer) {
        timer.textContent = formatTime(session.remaining);
        timer.classList.toggle('warning', session.remaining < 600);
      }
      if (session.remaining <= 0) finish(true);
    }, 1000);
  }

  function stopTimer() {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
  }

  app.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.start) start(target.dataset.start);
    if (target.dataset.route === 'domains') domainLab();
    if (target.dataset.examDomain) start('domain', { examDomain: target.dataset.examDomain });
    if (target.dataset.topic) start('topic', { topic: target.dataset.topic });
    if (target.dataset.option !== undefined) selectOption(Number(target.dataset.option));
    if (target.hasAttribute('data-check')) {
      session.questions[session.index].submitted = true;
      renderExam();
    }
    if (target.dataset.jump !== undefined) { session.index = Number(target.dataset.jump); renderExam(); }
    if (target.hasAttribute('data-flag')) {
      session.flagged = session.flagged.includes(session.index)
        ? session.flagged.filter((index) => index !== session.index)
        : [...session.flagged, session.index];
      renderExam();
    }
    if (target.hasAttribute('data-previous') && session.index > 0) { session.index -= 1; renderExam(); }
    if (target.hasAttribute('data-next')) {
      if (session.index === session.questions.length - 1) finish();
      else { session.index += 1; renderExam(); }
    }
    if (target.hasAttribute('data-submit')) finish();
    if (target.dataset.review) renderReview(target.dataset.review);
    if (target.hasAttribute('data-results')) renderResults();
    if (target.hasAttribute('data-home')) home();
    if (target.hasAttribute('data-restart')) start(session.mode, session.focus);
  });

  home();
})();
