(() => {
  'use strict';
  const data = window.APP_DATA;
  if (!data) return;

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const bnDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
  const toBn = value => String(value).replace(/\d/g, d => bnDigits[Number(d)]);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const shuffle = array => {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const safeStorage = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  };

  let seen = new Set(safeStorage.get('abc-viva-seen', []));

  // Feedback sounds (Web Audio, no audio files): correct = rising chime, wrong = low buzz.
  let soundCtx = null;
  function playTone(freq, start, duration, type, volume) {
    try {
      if (!soundCtx) soundCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (soundCtx.state === 'suspended') soundCtx.resume();
      const osc = soundCtx.createOscillator();
      const gain = soundCtx.createGain();
      const t = soundCtx.currentTime + start;
      osc.type = type; osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(soundCtx.destination);
      osc.start(t); osc.stop(t + duration + 0.05);
    } catch (e) { /* sound unavailable: stay silent */ }
  }
  function playCorrectSound() {
    playTone(523.25, 0, 0.16, 'sine', 0.16);
    playTone(659.25, 0.1, 0.16, 'sine', 0.16);
    playTone(783.99, 0.2, 0.24, 'sine', 0.16);
  }
  function playWrongSound() {
    playTone(220, 0, 0.18, 'triangle', 0.14);
    playTone(155.56, 0.14, 0.26, 'triangle', 0.14);
  }
  const sectionState = {
    A: { query: '', topic: 'সব', expandedAll: false },
    B: { query: '', topic: 'সব', expandedAll: false },
    C: { query: '', topic: 'সব', expandedAll: false }
  };

  const questions = { A: data.aQuestions, B: data.bQuestions, C: data.cQuestions };
  const lists = { A: $('#questionsA'), B: $('#questionsB'), C: $('#questionsC') };

  function answerHTML(text) {
    return esc(text)
      .replace(/\s•\s/g, '<br><span class="bullet">•</span> ')
      .replace(/^•\s/g, '<span class="bullet">•</span> ');
  }

  function visualHTML(item) {
    return `<button class="related-thumb" type="button" data-image-src="${esc(item.src)}" data-image-name="${esc(item.name)}" data-image-category="${esc(item.category || 'সহায়ক ভিজ্যুয়াল')}">
      <img src="${esc(item.src)}" alt="${esc(item.name)}" loading="lazy">
      <span>${esc(item.name)}</span>
    </button>`;
  }

  function renderQuestions(type) {
    const label = type;
    lists[type].innerHTML = questions[type].map(q => {
      const related = q.related?.length ? `<div class="related-visuals">${q.related.map(visualHTML).join('')}</div>` : '';
      return `<article class="qa-card" data-type="${type}" data-id="${q.id}" data-topic="${esc(q.topic)}" data-search="${esc((q.question + ' ' + q.answer + ' ' + q.topic).toLocaleLowerCase('bn'))}" id="${type.toLowerCase()}-q-${q.id}">
        <button class="question-trigger" type="button" aria-expanded="false" aria-controls="${type.toLowerCase()}-answer-${q.id}">
          <span class="question-no">${label} • ${String(q.id).padStart(2,'0')}</span>
          <span class="question-copy"><span class="question-topic">${esc(q.topic)}</span>${esc(q.question)}</span>
          <span class="toggle-plus" aria-hidden="true">+</span>
        </button>
        <div class="answer-shell" id="${type.toLowerCase()}-answer-${q.id}"><div class="answer-inner"><div class="answer-content">
          <span class="answer-label">উত্তর</span>
          <p class="answer-text">${answerHTML(q.answer)}</p>
          ${related}
        </div></div></div>
      </article>`;
    }).join('');

    lists[type].addEventListener('click', event => {
      const visual = event.target.closest('.related-thumb');
      if (visual) {
        const relatedButtons = $$('.related-thumb', visual.closest('.related-visuals'));
        const visualList = relatedButtons.map(btn => ({ src: btn.dataset.imageSrc, name: btn.dataset.imageName, category: btn.dataset.imageCategory }));
        openModal(visualList, relatedButtons.indexOf(visual));
        return;
      }
      const trigger = event.target.closest('.question-trigger');
      if (!trigger) return;
      const card = trigger.closest('.qa-card');
      toggleCard(card, !card.classList.contains('open'), true);
    });

    renderTopics(type);
    updateProgress(type);
  }

  function renderPrep() {
    const prepList = $('#prepList');
    if (!prepList) return;
    const prepItems = (data.prep || []).map(ref => {
      const q = questions[ref.type] && questions[ref.type].find(item => item.id === ref.id);
      return q ? { ...q, type: ref.type } : null;
    }).filter(Boolean);
    prepList.innerHTML = prepItems.map(q => {
      const key = `${q.type}${q.id}`;
      return `<article class="qa-card prep-card" data-type="${q.type}" data-id="${q.id}" id="prep-q-${key}">
        <button class="question-trigger" type="button" aria-expanded="false" aria-controls="prep-answer-${key}">
          <span class="question-no">${q.type} • ${String(q.id).padStart(2,'0')}</span>
          <span class="question-copy"><span class="question-topic">${esc(q.topic)}</span>${esc(q.question)}</span>
          <span class="toggle-plus" aria-hidden="true">+</span>
        </button>
        <div class="answer-shell" id="prep-answer-${key}"><div class="answer-inner"><div class="answer-content">
          <span class="answer-label">উত্তর</span>
          <p class="answer-text">${answerHTML(q.answer)}</p>
        </div></div></div>
      </article>`;
    }).join('');
    prepList.addEventListener('click', event => {
      const trigger = event.target.closest('.question-trigger');
      if (!trigger) return;
      const card = trigger.closest('.qa-card');
      toggleCard(card, !card.classList.contains('open'), true);
    });
    const countEl = $('#prepCount');
    if (countEl) {
      const per = type => prepItems.filter(q => q.type === type).length;
      countEl.textContent = `${toBn(prepItems.length)}টি কোর প্রশ্ন • A ${toBn(per('A'))}টি • B ${toBn(per('B'))}টি • C ${toBn(per('C'))}টি`;
    }
    const expandBtn = $('#prepExpandBtn');
    if (expandBtn) expandBtn.addEventListener('click', () => {
      const cards = $$('.qa-card', prepList);
      const shouldOpen = cards.some(card => !card.classList.contains('open'));
      cards.forEach(card => toggleCard(card, shouldOpen, shouldOpen));
      expandBtn.textContent = shouldOpen ? 'সব উত্তর লুকাও' : 'সব উত্তর দেখাও';
    });
  }

  function toggleCard(card, open, countAsSeen = false) {
    card.classList.toggle('open', open);
    $('.question-trigger', card).setAttribute('aria-expanded', String(open));
    if (open && countAsSeen) {
      const key = `${card.dataset.type}-${card.dataset.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        safeStorage.set('abc-viva-seen', [...seen]);
        updateProgress(card.dataset.type);
      }
    }
  }

  function renderTopics(type) {
    const target = $(`#topics${type}`);
    const topics = ['সব', ...new Set(questions[type].map(q => q.topic))];
    target.innerHTML = topics.map((topic, i) => `<button class="topic-chip${i === 0 ? ' active' : ''}" type="button" data-topic="${esc(topic)}">${esc(topic)}</button>`).join('');
    target.addEventListener('click', event => {
      const chip = event.target.closest('.topic-chip');
      if (!chip) return;
      $$('.topic-chip', target).forEach(x => x.classList.toggle('active', x === chip));
      sectionState[type].topic = chip.dataset.topic;
      applyFilters(type);
    });
  }

  function applyFilters(type) {
    const { query, topic } = sectionState[type];
    let visible = 0;
    $$('.qa-card', lists[type]).forEach(card => {
      const searchMatch = !query || card.dataset.search.includes(query.toLocaleLowerCase('bn'));
      const topicMatch = topic === 'সব' || card.dataset.topic === topic;
      card.classList.toggle('search-hidden', !searchMatch);
      card.classList.toggle('topic-hidden', !topicMatch);
      if (searchMatch && topicMatch) visible++;
    });
    $(`#empty${type}`).hidden = visible > 0;
  }

  function updateProgress(type) {
    const total = questions[type].length;
    const count = questions[type].filter(q => seen.has(`${type}-${q.id}`)).length;
    $(`#progressText${type}`).textContent = `${toBn(count)} / ${toBn(total)} দেখা`;
    $(`#progressBar${type}`).style.width = `${(count / total) * 100}%`;
  }

  ['A','B','C'].forEach(type => {
    renderQuestions(type);
    const search = $(`#search${type}`);
    search.addEventListener('input', () => {
      sectionState[type].query = search.value.trim();
      applyFilters(type);
    });
  });

  renderPrep();

  $$('.expand-btn').forEach(button => button.addEventListener('click', () => {
    const type = button.dataset.type;
    const cards = $$('.qa-card:not(.search-hidden):not(.topic-hidden)', lists[type]);
    const shouldOpen = cards.some(card => !card.classList.contains('open'));
    cards.forEach(card => toggleCard(card, shouldOpen, shouldOpen));
    button.textContent = shouldOpen ? 'সব উত্তর লুকাও' : 'সব উত্তর দেখাও';
    sectionState[type].expandedAll = shouldOpen;
  }));

  // Random viva practice: show only the question first, reveal the answer on demand.
  const randomModal = $('#randomModal');
  let randomType = 'A';
  let randomQuestion = null;
  let randomFocusBefore = null;

  function pickRandomQuestion(type) {
    const visibleIds = $$('.qa-card:not(.search-hidden):not(.topic-hidden)', lists[type]).map(card => Number(card.dataset.id));
    const pool = visibleIds.length ? questions[type].filter(q => visibleIds.includes(q.id)) : questions[type];
    if (!pool.length) return null;
    const candidates = pool.length > 1 && randomQuestion ? pool.filter(q => q.id !== randomQuestion.id) : pool;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function showRandomQuestion(type, keepModalOpen = false) {
    randomType = type;
    randomQuestion = pickRandomQuestion(type);
    if (!randomQuestion) return;
    $('#randomCategory').textContent = `${type} ক্যাটাগরি`;
    $('#randomTopic').textContent = randomQuestion.topic;
    $('#randomNumber').textContent = `${type} • ${String(randomQuestion.id).padStart(2,'0')}`;
    $('#randomQuestion').textContent = randomQuestion.question;
    $('#randomAnswerText').innerHTML = answerHTML(randomQuestion.answer);
    const answer = $('#randomAnswer');
    answer.hidden = true;
    answer.classList.remove('revealed');
    $('#thinkFirst').hidden = false;
    const reveal = $('#randomReveal');
    reveal.disabled = false;
    reveal.textContent = 'উত্তর দেখাও';
    if (!keepModalOpen) {
      randomFocusBefore = document.activeElement;
      randomModal.classList.add('open');
      randomModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      $('.random-close', randomModal).focus();
    }
  }

  function closeRandomModal() {
    randomModal.classList.remove('open');
    randomModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    randomFocusBefore?.focus?.();
  }

  $$('.random-btn').forEach(button => button.addEventListener('click', () => showRandomQuestion(button.dataset.type)));
  $('#randomReveal').addEventListener('click', () => {
    if (!randomQuestion) return;
    const answer = $('#randomAnswer');
    answer.hidden = false;
    answer.classList.add('revealed');
    $('#thinkFirst').hidden = true;
    const reveal = $('#randomReveal');
    reveal.disabled = true;
    reveal.textContent = 'উত্তর দেখা হয়েছে ✓';
    const key = `${randomType}-${randomQuestion.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      safeStorage.set('abc-viva-seen', [...seen]);
      updateProgress(randomType);
    }
  });
  $('#randomNext').addEventListener('click', () => showRandomQuestion(randomType, true));
  $$('[data-close-random]').forEach(x => x.addEventListener('click', closeRandomModal));

  $$('.reset-btn').forEach(button => button.addEventListener('click', () => {
    const type = button.dataset.type;
    questions[type].forEach(q => seen.delete(`${type}-${q.id}`));
    safeStorage.set('abc-viva-seen', [...seen]);
    updateProgress(type);
    showToast(`${type} ক্যাটাগরির অগ্রগতি রিসেট হয়েছে`);
  }));

  // Gallery
  const galleryData = {
    A: data.galleryA.map(x => ({...x, category:'A ক্যাটাগরি'})),
    B: data.galleryB.map(x => ({...x, category:'B ক্যাটাগরি'})),
    C: data.galleryC.map(x => ({...x, category:'C ক্যাটাগরি'})),
    D: data.diagrams.map((x, i) => ({...x, n:i+1, category:`${x.category} সহায়ক ডায়াগ্রাম`}))
  };
  let activeGallery = 'A';
  let galleryLimit = 20;
  let visibleGallery = [];

  function renderGallery(reset = false) {
    if (reset) galleryLimit = 20;
    const all = galleryData[activeGallery];
    visibleGallery = all.slice(0, galleryLimit);
    $('#galleryGrid').innerHTML = visibleGallery.map((item, i) => `<button class="gallery-card" type="button" data-index="${i}" aria-label="ছবিতে ক্লিক করে যন্ত্রের নাম দেখুন">
      <span class="gallery-badge">${activeGallery === 'D' ? esc(item.category.split(' ')[0]) : activeGallery} • ${String(item.n || i+1).padStart(2,'0')}</span>
      <img src="${esc(item.src)}" alt="নাম লুকানো যন্ত্রের ছবি" loading="lazy">
      <span class="reveal-hint"><span>⊙</span> ক্লিক করে নাম দেখো</span>
    </button>`).join('');
    const more = $('#loadMore');
    more.style.display = galleryLimit < all.length ? 'flex' : 'none';
    more.textContent = `আরও ${toBn(Math.min(20, all.length - galleryLimit))}টি ছবি দেখাও`;
  }

  $$('.gallery-tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.gallery-tab').forEach(x => { x.classList.toggle('active', x === tab); x.setAttribute('aria-selected', String(x === tab)); });
    activeGallery = tab.dataset.gallery;
    renderGallery(true);
  }));

  $('#galleryGrid').addEventListener('click', event => {
    const card = event.target.closest('.gallery-card');
    if (!card) return;
    openModal(visibleGallery, Number(card.dataset.index));
  });
  $('#loadMore').addEventListener('click', () => { galleryLimit += 20; renderGallery(); });
  renderGallery(true);

  // Mock Viva Exam
  const mockModal = $('#mockModal');
  let mockCategory = 'A';
  let mockCount = 10;
  let mockItems = [];
  let mockIndex = 0;
  let mockPassed = 0;
  let mockWeak = {};
  let mockTimeLeft = 0;
  let mockTimerId = null;
  let mockFocusBefore = null;

  function setMockStage(stage) {
    ['mockSetup','mockRun','mockResult'].forEach(id => { $(`#${id}`).hidden = id !== stage; });
  }
  function openMockModal() {
    mockFocusBefore = document.activeElement;
    setMockStage('mockSetup');
    mockModal.classList.add('open');
    mockModal.setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
    $('.practice-close', mockModal).focus();
  }
  function closeMockModal() {
    clearInterval(mockTimerId);
    mockTimerId = null;
    mockModal.classList.remove('open');
    mockModal.setAttribute('aria-hidden','true');
    document.body.classList.remove('modal-open');
    mockFocusBefore?.focus?.();
  }
  function mockPool() {
    if (mockCategory === 'A') return questions.A.map(q => ({...q,_type:'A'}));
    if (mockCategory === 'B') return questions.B.map(q => ({...q,_type:'B'}));
    if (mockCategory === 'C') return questions.C.map(q => ({...q,_type:'C'}));
    return [...questions.A.map(q => ({...q,_type:'A'})), ...questions.B.map(q => ({...q,_type:'B'})), ...questions.C.map(q => ({...q,_type:'C'}))];
  }
  function updateMockTimer() {
    const mins = Math.floor(mockTimeLeft / 60);
    const secs = mockTimeLeft % 60;
    const timer = $('#mockTimer');
    timer.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    timer.classList.toggle('danger', mockTimeLeft <= 60);
  }
  function startMockExam() {
    mockItems = shuffle(mockPool()).slice(0, Math.min(mockCount, mockPool().length));
    mockIndex = 0;
    mockPassed = 0;
    mockWeak = {};
    mockTimeLeft = mockItems.length * 45;
    setMockStage('mockRun');
    updateMockTimer();
    clearInterval(mockTimerId);
    mockTimerId = setInterval(() => {
      mockTimeLeft--;
      updateMockTimer();
      if (mockTimeLeft <= 0) finishMockExam(true);
    }, 1000);
    showMockQuestion();
  }
  function showMockQuestion() {
    const item = mockItems[mockIndex];
    if (!item) return finishMockExam(false);
    $('#mockRunCategory').textContent = `${item._type} ক্যাটাগরি`;
    $('#mockRunTopic').textContent = item.topic;
    $('#mockCounter').textContent = `প্রশ্ন ${toBn(mockIndex + 1)} / ${toBn(mockItems.length)}`;
    $('#mockProgressBar').style.width = `${(mockIndex / mockItems.length) * 100}%`;
    $('#mockQuestion').textContent = item.question;
    $('#mockAnswerText').innerHTML = answerHTML(item.answer);
    $('#mockAnswer').hidden = true;
    $('#mockAnswer').classList.remove('revealed');
    $('#mockAnswer').classList.remove('celebrate');
    $('#mockThink').hidden = false;
    $('#mockRevealWrap').hidden = false;
    $('#mockGrade').hidden = true;
  }
  function finishMockExam(timedOut = false) {
    clearInterval(mockTimerId);
    mockTimerId = null;
    const total = mockItems.length || mockCount;
    const failed = total - mockPassed;
    const percent = Math.round((mockPassed / total) * 100);
    setMockStage('mockResult');
    $('#mockScore').textContent = `${toBn(mockPassed)}/${toBn(total)}`;
    $('#mockRight').textContent = toBn(mockPassed);
    $('#mockWrong').textContent = toBn(failed);
    $('#mockPercent').textContent = `${toBn(percent)}%`;
    $('#mockScoreRing').style.setProperty('--score', percent);
    $('#mockResultTitle').textContent = percent >= 80 ? 'অসাধারণ প্রস্তুতি!' : percent >= 55 ? 'ভালোই এগোচ্ছো!' : 'আরেকবার ঝালিয়ে নাও';
    $('#mockResultText').textContent = timedOut ? 'সময় শেষ হয়েছে। যে প্রশ্নগুলো বাকি ছিল সেগুলোও “পারিনি” হিসেবে ধরা হয়েছে।' : percent >= 80 ? 'ভাইভার জন্য তোমার প্রস্তুতি বেশ শক্ত। দুর্বল বিষয়গুলো একবার দেখে নাও।' : 'যে বিষয়গুলো কঠিন লেগেছে সেগুলো দেখে আবার পরীক্ষা দাও।';
    const weakEntries = Object.entries(mockWeak).sort((a,b) => b[1]-a[1]).slice(0,5);
    $('#mockWeakBox').hidden = weakEntries.length === 0;
    $('#mockWeakTopics').innerHTML = weakEntries.map(([topic,count]) => `<span>${esc(topic)} • ${toBn(count)}</span>`).join('');
  }
  $('#openMockExam').addEventListener('click', openMockModal);
  $$('[data-close-mock]').forEach(x => x.addEventListener('click', closeMockModal));
  $('#mockCategoryChoices').addEventListener('click', event => {
    const button = event.target.closest('.choice-pill'); if (!button) return;
    $$('.choice-pill', $('#mockCategoryChoices')).forEach(x => x.classList.toggle('active', x === button));
    mockCategory = button.dataset.value;
  });
  $('#mockCountChoices').addEventListener('click', event => {
    const button = event.target.closest('.choice-pill'); if (!button) return;
    $$('.choice-pill', $('#mockCountChoices')).forEach(x => x.classList.toggle('active', x === button));
    mockCount = Number(button.dataset.value);
  });
  $('#startMock').addEventListener('click', startMockExam);
  $('#mockReveal').addEventListener('click', () => {
    $('#mockAnswer').hidden = false;
    $('#mockAnswer').classList.add('revealed');
    $('#mockThink').hidden = true;
    $('#mockRevealWrap').hidden = true;
    $('#mockGrade').hidden = false;
  });
  $('#mockGrade').addEventListener('click', event => {
    const button = event.target.closest('.grade-btn'); if (!button) return;
    const item = mockItems[mockIndex];
    if (button.dataset.grade === 'pass') {
      mockPassed++;
      playCorrectSound();
      $('#mockAnswer').classList.add('celebrate');
    } else {
      playWrongSound();
      mockWeak[item.topic] = (mockWeak[item.topic] || 0) + 1;
    }
    const key = `${item._type}-${item.id}`;
    if (!seen.has(key)) { seen.add(key); safeStorage.set('abc-viva-seen',[...seen]); updateProgress(item._type); }
    mockIndex++;
    if (mockIndex >= mockItems.length) finishMockExam(false); else showMockQuestion();
  });
  $('#mockBackSetup').addEventListener('click', () => setMockStage('mockSetup'));
  $('#mockRetry').addEventListener('click', startMockExam);

  // Image Recognition Quiz
  const imageQuizModal = $('#imageQuizModal');
  let imageQuizCategory = 'MIX';
  let imageQuizItems = [];
  let imageQuizIndex = 0;
  let imageQuizScore = 0;
  let imageQuizAnswered = false;
  let imageQuizAdvanceTimer = null;
  let imageQuizFocusBefore = null;

  function setImageQuizStage(stage) {
    if (stage !== 'imageQuizRun') clearImageQuizTimer();
    ['imageQuizSetup','imageQuizRun','imageQuizResult'].forEach(id => { $(`#${id}`).hidden = id !== stage; });
  }
  function clearImageQuizTimer() {
    if (imageQuizAdvanceTimer) { clearTimeout(imageQuizAdvanceTimer); imageQuizAdvanceTimer = null; }
  }
  function advanceImageQuiz() {
    clearImageQuizTimer();
    imageQuizIndex++;
    if (imageQuizIndex >= imageQuizItems.length) finishImageQuiz(); else showImageQuizQuestion();
  }
  function openImageQuizModal() {
    imageQuizFocusBefore = document.activeElement;
    setImageQuizStage('imageQuizSetup');
    imageQuizModal.classList.add('open');
    imageQuizModal.setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
    $('.practice-close', imageQuizModal).focus();
  }
  function closeImageQuizModal() {
    clearImageQuizTimer();
    imageQuizModal.classList.remove('open');
    imageQuizModal.setAttribute('aria-hidden','true');
    document.body.classList.remove('modal-open');
    imageQuizFocusBefore?.focus?.();
  }
  function getUniqueImages(items) {
    const map = new Map();
    items.forEach(item => { if (!map.has(item.name.toLocaleLowerCase())) map.set(item.name.toLocaleLowerCase(), item); });
    return [...map.values()];
  }
  function imagePool() {
    if (imageQuizCategory === 'A') return getUniqueImages(galleryData.A);
    if (imageQuizCategory === 'B') return getUniqueImages(galleryData.B);
    if (imageQuizCategory === 'C') return getUniqueImages(galleryData.C);
    return getUniqueImages([...galleryData.A, ...galleryData.B, ...galleryData.C]);
  }
  function startImageQuiz() {
    imageQuizItems = shuffle(imagePool()).slice(0,20);
    imageQuizIndex = 0;
    imageQuizScore = 0;
    $('#imageLiveScore').textContent = '০';
    setImageQuizStage('imageQuizRun');
    showImageQuizQuestion();
  }
  function showImageQuizQuestion() {
    const item = imageQuizItems[imageQuizIndex];
    clearImageQuizTimer();
    imageQuizAnswered = false;
    $('#imageRunCategory').textContent = imageQuizCategory === 'MIX' ? 'A + B + C মিশ্র' : `${imageQuizCategory} ক্যাটাগরি`;
    $('#imageCounter').textContent = `ছবি ${toBn(imageQuizIndex + 1)} / ${toBn(imageQuizItems.length)}`;
    $('#imageProgressBar').style.width = `${(imageQuizIndex / imageQuizItems.length) * 100}%`;
    $('#quizImage').src = item.src;
    $('#quizImage').alt = 'নাম শনাক্ত করার জন্য যন্ত্রের ছবি';
    const names = [...new Set(imagePool().map(x => x.name))].filter(name => name !== item.name);
    const options = shuffle([item.name, ...shuffle(names).slice(0,3)]);
    $('#quizOptions').innerHTML = options.map(name => `<button class="quiz-option" type="button" data-name="${esc(name)}">${esc(name)}</button>`).join('');
    const feedback = $('#quizFeedback');
    feedback.hidden = true; feedback.className = 'quiz-feedback'; feedback.textContent = '';
    $('.quiz-image-wrap').classList.remove('celebrate');
    $('#imageQuizNext').hidden = true;
    $('#imageQuizNext').textContent = imageQuizIndex === imageQuizItems.length - 1 ? 'ফলাফল দেখি →' : 'পরের ছবি →';
  }
  function finishImageQuiz() {
    const total = imageQuizItems.length;
    const percent = Math.round((imageQuizScore / total) * 100);
    setImageQuizStage('imageQuizResult');
    $('#imageFinalScore').textContent = `${toBn(imageQuizScore)}/${toBn(total)}`;
    $('#imageCorrect').textContent = toBn(imageQuizScore);
    $('#imageIncorrect').textContent = toBn(total - imageQuizScore);
    $('#imagePercent').textContent = `${toBn(percent)}%`;
    $('#imageScoreRing').style.setProperty('--score', percent);
    $('#imageResultTitle').textContent = percent >= 80 ? 'যন্ত্র চেনায় তুমি দারুণ!' : percent >= 50 ? 'ভালো—আরও একটু practice!' : 'ছবিগুলো আরেকবার দেখো';
    $('#imageResultText').textContent = percent >= 80 ? 'ভাইভা টেবিলের যন্ত্রগুলো বেশ ভালোভাবে চিনতে পারছো।' : 'নিচের ছবি চেনার অনুশীলন থেকে নামগুলো দেখে আবার Quiz দাও।';
  }
  $('#openImageQuiz').addEventListener('click', openImageQuizModal);
  $$('[data-close-image-quiz]').forEach(x => x.addEventListener('click', closeImageQuizModal));
  $('#imageCategoryChoices').addEventListener('click', event => {
    const button = event.target.closest('.choice-pill'); if (!button) return;
    $$('.choice-pill', $('#imageCategoryChoices')).forEach(x => x.classList.toggle('active', x === button));
    imageQuizCategory = button.dataset.value;
  });
  $('#startImageQuiz').addEventListener('click', startImageQuiz);
  $('#quizOptions').addEventListener('click', event => {
    const button = event.target.closest('.quiz-option');
    if (!button || imageQuizAnswered) return;
    imageQuizAnswered = true;
    const item = imageQuizItems[imageQuizIndex];
    const selected = button.dataset.name;
    const correct = selected === item.name;
    if (correct) {
      imageQuizScore++;
      playCorrectSound();
      const wrap = $('.quiz-image-wrap');
      wrap.classList.remove('celebrate'); void wrap.offsetWidth; wrap.classList.add('celebrate');
    } else {
      playWrongSound();
    }
    $('#imageLiveScore').textContent = toBn(imageQuizScore);
    $$('.quiz-option', $('#quizOptions')).forEach(option => {
      option.disabled = true;
      if (option.dataset.name === item.name) option.classList.add('correct');
      else if (option === button) option.classList.add('wrong');
    });
    const feedback = $('#quizFeedback');
    feedback.hidden = false;
    feedback.classList.add(correct ? 'correct' : 'wrong');
    feedback.textContent = correct ? '✓ সঠিক উত্তর!' : `✕ সঠিক উত্তর: ${item.name}`;
    const nextBtn = $('#imageQuizNext');
    nextBtn.hidden = false;
    try { nextBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
    clearImageQuizTimer();
    imageQuizAdvanceTimer = setTimeout(advanceImageQuiz, correct ? 1400 : 2200);
  });
  $('#imageQuizNext').addEventListener('click', advanceImageQuiz);
  $('#imageBackSetup').addEventListener('click', () => setImageQuizStage('imageQuizSetup'));
  $('#imageQuizRetry').addEventListener('click', startImageQuiz);

  // Image modal
  const modal = $('#imageModal');
  let currentModalList = [];
  let modalIndex = 0;
  let focusBeforeModal = null;

  function openModal(list, index = 0) {
    if (!list?.length) return;
    currentModalList = list;
    modalIndex = Math.max(0, Math.min(index, list.length - 1));
    focusBeforeModal = document.activeElement;
    updateModal();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    $('.modal-close', modal).focus();
  }

  function updateModal() {
    const item = currentModalList[modalIndex];
    $('#modalImage').src = item.src;
    $('#modalImage').alt = item.name;
    $('#modalName').textContent = item.name;
    $('#modalCategory').textContent = item.category || 'সহায়ক ভিজ্যুয়াল';
    $('#modalHint').textContent = item.category?.includes('ডায়াগ্রাম') ? 'ডায়াগ্রামের সংযোগ ও ধাপগুলো ভালো করে দেখো।' : 'এই নামটি মনে রাখো—ভাইভায় নামের সঙ্গে কাজও বলবে।';
    const hasMany = currentModalList.length > 1;
    $('#modalPrev').style.display = hasMany ? '' : 'none';
    $('#modalNext').style.display = hasMany ? '' : 'none';
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    focusBeforeModal?.focus?.();
  }
  const modalMove = delta => { modalIndex = (modalIndex + delta + currentModalList.length) % currentModalList.length; updateModal(); };
  $$('[data-close-modal]').forEach(x => x.addEventListener('click', closeModal));
  $('#modalPrev').addEventListener('click', () => modalMove(-1));
  $('#modalNext').addEventListener('click', () => modalMove(1));
  document.addEventListener('keydown', event => {
    if (mockModal.classList.contains('open')) {
      if (event.key === 'Escape') closeMockModal();
      return;
    }
    if (imageQuizModal.classList.contains('open')) {
      if (event.key === 'Escape') closeImageQuizModal();
      return;
    }
    if (randomModal.classList.contains('open')) {
      if (event.key === 'Escape') closeRandomModal();
      return;
    }
    if (modal.classList.contains('open')) {
      if (event.key === 'Escape') closeModal();
      if (event.key === 'ArrowLeft') modalMove(-1);
      if (event.key === 'ArrowRight') modalMove(1);
      return;
    }
    if (event.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      event.preventDefault();
      const tops = [['#searchA', $('#a-section')], ['#searchB', $('#b-section')], ['#searchC', $('#c-section')]].map(([sel, el]) => [sel, Math.abs(el.getBoundingClientRect().top)]);
      tops.sort((x, y) => x[1] - y[1]);
      $(tops[0][0]).focus();
    }
  });

  // Navigation & utility
  const menuButton = $('#menuButton');
  const mainNav = $('.main-nav');
  menuButton.addEventListener('click', () => {
    const open = mainNav.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
  });
  $$('.main-nav a').forEach(link => link.addEventListener('click', () => { mainNav.classList.remove('open'); menuButton.setAttribute('aria-expanded','false'); }));

  const backTop = $('#backTop');
  window.addEventListener('scroll', () => backTop.classList.toggle('visible', scrollY > 700), {passive:true});
  backTop.addEventListener('click', () => window.scrollTo({top:0,behavior:'smooth'}));

  // Desktop only: scrolling down slides the search/filter bars away to the
  // right and leaves a square blue button; the button (or scrolling to the
  // top) brings the bars back.
  const panelRestore = $('#panelRestore');
  const desktopView = window.matchMedia('(min-width: 1001px)');
  let lastScrollY = scrollY;
  let panelsMinimized = false;
  let restoreY = null;
  function setPanelsMinimized(minimize) {
    panelsMinimized = minimize;
    document.body.classList.toggle('panels-minimized', minimize);
    panelRestore.setAttribute('aria-expanded', String(!minimize));
  }
  function onPanelScroll() {
    if (!desktopView.matches) { if (panelsMinimized) setPanelsMinimized(false); lastScrollY = scrollY; return; }
    const goingDown = scrollY > lastScrollY;
    if (scrollY <= 120) { restoreY = null; if (panelsMinimized) setPanelsMinimized(false); }
    else if (restoreY !== null && scrollY < restoreY - 60) { restoreY = null; }
    else if (goingDown && scrollY > 320 && !panelsMinimized && (restoreY === null || scrollY > restoreY + 60)) { restoreY = null; setPanelsMinimized(true); }
    lastScrollY = scrollY;
  }
  let panelScrollTick = false;
  window.addEventListener('scroll', () => {
    if (panelScrollTick) return;
    panelScrollTick = true;
    requestAnimationFrame(() => { panelScrollTick = false; onPanelScroll(); });
  }, {passive:true});
  panelRestore.addEventListener('click', () => {
    restoreY = scrollY;
    setPanelsMinimized(false);
  });
  desktopView.addEventListener('change', () => { if (!desktopView.matches && panelsMinimized) setPanelsMinimized(false); });

  let toastTimer;
  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  // Stats from the actual content, not hardcoded display only.
  $('#statA').textContent = toBn(data.meta.aCount);
  $('#statB').textContent = toBn(data.meta.bCount);
  $('#statC').textContent = toBn(data.meta.cCount);
  $('#statPhotos').textContent = toBn(data.meta.aPhotos + data.meta.bPhotos + data.meta.cPhotos);
  $('#statDiagrams').textContent = toBn(data.meta.diagramCount);
  $('#updatedDate').textContent = data.meta.updated;

  // Gentle scroll-reveal animation for the main learning blocks.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('motion-ready');
    const revealTargets = $$('.license-section, .howto-card, .qa-title-row, .study-note, .factory-checklist, .gallery-title, .gallery-tabs, .gallery-tip, .safety-card');
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: .12, rootMargin: '0px 0px -45px 0px' });
    revealTargets.forEach((el, i) => {
      el.classList.add('reveal-item');
      el.style.setProperty('--reveal-delay', `${(i % 3) * 55}ms`);
      revealObserver.observe(el);
    });
  }
})();
