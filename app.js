(() => {
  'use strict';

  const bank = (window.AWS_QUESTION_BANK || []).filter((question) =>
    question.question?.trim().length >= 8 && question.answer
  );
  const app = document.querySelector('#app');
  let timerId = null;
  let session = null;

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

  function home() {
    stopTimer();
    session = null;
    app.innerHTML = `
      <header class="site-header"><div class="brand">Arch<span>Ready</span></div><span class="tag">${bank.length} questions</span></header>
      <div class="shell hero">
        <section class="panel">
          <div class="eyebrow">AWS Solutions Architect Associate</div>
          <h1>Practice the decision, not the guess.</h1>
          <p class="subtext">Build exam stamina with focused practice or a complete 65-question, 130-minute simulation.</p>
          <div class="actions"><button class="btn btn-primary" data-start="practice">Start quick practice</button><button class="btn" data-start="mock">Take full mock</button></div>
        </section>
        <aside class="panel session-options">
          <div class="mode"><h3>Quick practice</h3><p>10 untimed questions for a focused study block.</p><button class="btn" data-start="practice">Begin 10 questions</button></div>
          <div class="mode"><h3>Full mock</h3><p>65 questions with a 130-minute countdown.</p><button class="btn" data-start="mock">Begin timed exam</button></div>
        </aside>
      </div>`;
  }

  function start(mode) {
    const count = mode === 'mock' ? Math.min(65, bank.length) : Math.min(10, bank.length);
    const questions = shuffle(bank, Date.now()).slice(0, count).map((question) => ({
      ...question,
      options: optionsFor(question),
      selected: []
    }));
    session = {
      mode,
      questions,
      index: 0,
      remaining: mode === 'mock' ? 130 * 60 : null,
      startedAt: Date.now()
    };
    renderExam();
    if (session.remaining !== null) startTimer();
  }

  function renderExam() {
    const question = session.questions[session.index];
    const required = Math.max(1, Number(question.selectionsRequired) || 1);
    app.innerHTML = `
      <header class="exam-header">
        <div class="brand">Arch<span>Ready</span></div>
        <div class="exam-progress-label">Question ${session.index + 1} of ${session.questions.length}</div>
        ${session.remaining === null ? '<span></span>' : `<div class="timer ${session.remaining < 600 ? 'warning' : ''}" data-timer>${formatTime(session.remaining)}</div>`}
      </header>
      <div class="exam-layout">
        <article class="question-card">
          <div class="question-meta"><div><span class="tag">${escapeHTML(question.category || 'AWS')}</span> <span class="tag">Choose ${required}</span></div></div>
          <div class="question-text">${escapeHTML(question.question)}</div>
          <div class="options">${question.options.map((option, index) => `
            <button class="option ${question.selected.includes(index) ? 'selected' : ''}" data-option="${index}">
              <span class="option-key">${String.fromCharCode(65 + index)}</span><span>${escapeHTML(option.text)}</span>
            </button>`).join('')}</div>
          <div class="question-actions">
            <button class="btn" data-previous ${session.index === 0 ? 'disabled' : ''}>Previous</button>
            <button class="btn btn-primary" data-next>${session.index === session.questions.length - 1 ? 'Submit exam' : 'Next question'}</button>
          </div>
        </article>
      </div>`;
  }

  function selectOption(index) {
    const question = session.questions[session.index];
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

  function finish() {
    stopTimer();
    const answered = session.questions.filter((question) => question.selected.length).length;
    const correct = session.questions.filter((question) => {
      const expected = question.options.map((option, index) => option.correct ? index : -1).filter((index) => index >= 0);
      return expected.length === question.selected.length && expected.every((index) => question.selected.includes(index));
    }).length;
    const score = Math.round((correct / session.questions.length) * 100);
    app.innerHTML = `
      <header class="site-header"><div class="brand">Arch<span>Ready</span></div></header>
      <div class="shell"><section class="panel">
        <div class="eyebrow">Session complete</div><h1>${score}%</h1>
        <p class="subtext">Your ${session.mode === 'mock' ? 'full mock' : 'practice session'} has been scored.</p>
        <div class="summary"><div><strong>${correct}</strong><span>Correct</span></div><div><strong>${answered}</strong><span>Answered</span></div><div><strong>${session.questions.length - answered}</strong><span>Unanswered</span></div></div>
        <div class="actions"><button class="btn btn-primary" data-home>Return home</button><button class="btn" data-restart>Try another session</button></div>
      </section></div>`;
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
      if (session.remaining <= 0) finish();
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
    if (target.dataset.option !== undefined) selectOption(Number(target.dataset.option));
    if (target.hasAttribute('data-previous') && session.index > 0) { session.index -= 1; renderExam(); }
    if (target.hasAttribute('data-next')) {
      if (session.index === session.questions.length - 1) finish();
      else { session.index += 1; renderExam(); }
    }
    if (target.hasAttribute('data-home')) home();
    if (target.hasAttribute('data-restart')) start(session.mode);
  });

  home();
})();
