const NUM_TRIALS = 10;
const NUM_SAMPLES = 100;
const SHIFT_SAMPLES = 10;
const NUM_SLICES = 10;
const SLIDER_START = 50;
const LAST_PAGE_DURATION = 3000; // ms

const NUM_SYSTEMS = 9;
const TEST_VERSION = 'assets_v2';
const REPO_NAME = 'herimor/mushra-test';
const PROLIFIC_URL = 'https://app.prolific.com/submissions/complete?cc';
const PROLIFIC_ID = 'PROLIFIC_ID';

(function () {
  // ---- Style injection (only once) ----
  var STYLE_ID = "mseq-style";
  function injectStylesOnce() {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    var css =
      ".mseq-wrapper{display:flex;flex-direction:row;gap:16px;justify-content:center;align-items:stretch;overflow-x:auto;padding:6px 2px;margin:18px 0;-webkit-overflow-scrolling:touch;}" +
      ".mseq-card{width:100px;min-width:100px;border:1px solid #e5e7eb;border-radius:12px;padding:14px;box-shadow:0 1px 2px rgba(0,0,0,.05);display:flex;flex-direction:column;gap:10px;}" +
      ".mseq-card.blocked{opacity:.55;filter:grayscale(.1);}" +
      ".mseq-hdr{display:flex;align-items:center;justify-content:space-between;}" +
      ".mseq-title{font-size:14px;font-weight:600;color:#111827;}" +
      ".mseq-status{font-size:12px;color:#6b7280;}" +
      ".mseq-play{display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:10px;border:1px solid #d1d5db;background:#fff;cursor:pointer;font-weight:600;transition:transform 120ms ease,background 120ms ease;}" +
      ".mseq-play[disabled]{opacity:.45;cursor:not-allowed;}" +
      ".mseq-play.playing{background:#eef2ff;border-color:#c7d2fe;}" +
      ".mseq-sliderrow {display: flex;flex-direction: column;align-items: center;gap: 6px;}" +
      ".mseq-sliderrow input[type=range] {writing-mode: bt-lr;-webkit-appearance: slider-vertical;width: 10px;height: 100px;}" +
      ".mseq-val{width:3ch;text-align:right;font-variant-numeric:tabular-nums;}" +
      ".mseq-helper{color:#374151;font-size:18px;margin-top:4px;text-align:center;}" +
      ".mseq-continue{text-align:center;margin-top:18px;}" +
      ".mseq-continue .jspsych-btn:disabled{opacity:.45;cursor:not-allowed;}";
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.type = "text/css";
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ---- Plugin ----
  function MushraSequentialPlugin(jsPsych) { this.jsPsych = jsPsych; }
  MushraSequentialPlugin.info = {
    name: "mushra-sequential",
    parameters: {
      stimuli: { default: [] }, // [{label?: string, src: string}]
      require_slider_interaction: { default: true },
      slider_start: { default: 100 },
      slider_min: { default: 0 },
      slider_max: { default: 100 },
      slider_step: { default: 1 },
      prompt: { default: "Listen to each clip and rate its naturalness on a scale from 0 to 100, where 0 means “bad” and 100 means “excellent”. You can listen to each audio and change your rating several times. Ensure that you move all the sliders before proceeding to the next page." }
    }
  };

  MushraSequentialPlugin.prototype.trial = function (display_element, trial) {
    injectStylesOnce();

    var n = (trial.stimuli && trial.stimuli.length) ? trial.stimuli.length : 0;
    var ratings = new Array(n); for (var r=0;r<n;r++) ratings[r] = null;
    var playedToEnd = new Array(n); for (var p=0;p<n;p++) playedToEnd[p] = false;
    var sliderMoved = new Array(n); for (var m=0;m<n;m++) sliderMoved[m] = false;

    var html = '';
    html += '<div class="mseq-helper">' + (trial.prompt || '') + '</div>';
    html += '<div class="mseq-wrapper">';

    for (var i=0;i<n;i++){
      var stim = trial.stimuli[i] || {};
      var locked = i !== 0;
      var title = (stim.label != null ? String(stim.label) : ('Audio ' + (i+1)));
      html +=
        '<div class="mseq-card' + (locked ? ' blocked' : '') + '" data-idx="' + i + '">' +
          '<div class="mseq-hdr">' +
            '<div class="mseq-status" id="mseq-status-' + i + '">' + (locked ? 'Locked' : 'Ready') + '</div>' +
          '</div>' +
          '<audio id="mseq-audio-' + i + '" src="' + (stim.src || '') + '" preload="auto"></audio>' +
          '<div><button class="mseq-play" id="mseq-btn-' + i + '"' + (locked ? ' disabled' : '') + ' aria-controls="mseq-audio-' + i + '">Play</button></div>' +
          '<div class="mseq-sliderrow">' +
            '<input type="range" id="mseq-slider-' + i + '" min="' + (trial.slider_min|0) + '" max="' + (trial.slider_max|0) + '" step="' + (trial.slider_step|0) + '" value="' + (trial.slider_start|0) + '" disabled />' +
            '<span class="mseq-val" id="mseq-val-' + i + '">' + (trial.slider_start|0) + '</span>' +
          '</div>' +
          '<div class="mseq-status" id="mseq-hint-' + i + '">Slider unlocks after full playback</div>' +
        '</div>';
    }

    html += '</div>';
    html += '<div class="mseq-continue"><button class="jspsych-btn" id="mseq-continue" disabled>Continue</button></div>';

    display_element.innerHTML = html;

    function qs(sel){ return display_element.querySelector(sel); }
    function unlockCard(j){
      var card = qs('.mseq-card[data-idx="'+j+'"]'); if (card) card.classList.remove('blocked');
      var btn  = qs('#mseq-btn-'+j); if (btn) btn.disabled = false;
      var st   = qs('#mseq-status-'+j); if (st) st.textContent = 'Ready';
    }
    function updateContinueState(){
      var allEnded = true, allMoved = true, k;
      for (k=0;k<n;k++){ if(!playedToEnd[k]){ allEnded = false; break; } }
      if (trial.require_slider_interaction){ for (k=0;k<n;k++){ if(!sliderMoved[k]){ allMoved = false; break; } } }
      qs('#mseq-continue').disabled = !(allEnded && allMoved);
    }

    for (var i2=0;i2<n;i2++){
      (function(i){
        var audio  = qs('#mseq-audio-'+i);
        var btn    = qs('#mseq-btn-'+i);
        var slider = qs('#mseq-slider-'+i);
        var val    = qs('#mseq-val-'+i);
        var status = qs('#mseq-status-'+i);

        btn.addEventListener('click', function(){
          // Pause others
          for (var k=0;k<n;k++){
            var a2 = qs('#mseq-audio-'+k);
            var b2 = qs('#mseq-btn-'+k);
            if (a2 && b2 && !a2.paused && k !== i){ a2.pause(); b2.classList.remove('playing'); if(!playedToEnd[k]) qs('#mseq-status-'+k).textContent = 'Paused'; }
          }
          if (audio.paused){
            audio.currentTime = 0;
            audio.play();
            btn.textContent = 'Playing...';
            btn.classList.add('playing');
            status.textContent = 'Playing';
          } else {
            audio.pause();
            btn.textContent = playedToEnd[i] ? 'Replay' : 'Play';
            btn.classList.remove('playing');
            status.textContent = playedToEnd[i] ? 'Completed' : 'Paused';
          }
        });

        audio.addEventListener('ended', function(){
          playedToEnd[i] = true;
          btn.textContent = 'Replay';
          btn.classList.remove('playing');
          status.textContent = 'Completed';
          slider.disabled = false;
          qs('#mseq-hint-'+i).textContent = 'Now rate this audio (0-100)';
          if (i + 1 < n) unlockCard(i + 1);
          updateContinueState();
        });

        slider.addEventListener('input', function(e){ val.textContent = e.target.value; });
        slider.addEventListener('change', function(e){
          ratings[i] = Number(e.target.value);
          sliderMoved[i] = true;
          // mark this block as completed after the user finishes moving the slider
          qs('#mseq-hint-' + i).textContent = 'Completed';
          updateContinueState();
        });
      })(i2);
    }

    qs('#mseq-continue').addEventListener('click', function(){
      var labels = [], sources = [];
      for (var j=0;j<n;j++){ var s = trial.stimuli[j] || {}; labels.push(s.label != null ? s.label : ''); sources.push(s.src || ''); }
      var trial_data = { ratings: ratings, played_to_end: playedToEnd, slider_moved: sliderMoved, labels: labels, sources: sources };
      display_element.innerHTML = '';
      (this.jsPsych || window.jsPsych).finishTrial(trial_data);
    }.bind(this));
  };

  // Safe registration only if jsPsych is present now
  if (typeof window !== 'undefined') {
    window.MushraSequentialPlugin = MushraSequentialPlugin; // expose class for class-type usage
    if (window.jsPsych && window.jsPsych.plugins) {
      window.jsPsych.plugins['mushra-sequential'] = MushraSequentialPlugin;
    }
  }
})();

// Helper: make an array ['A', 'B', ...] up to NUM_SYSTEMS
function makeLabels(n) {
  // A = char code 65
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
}

// Helper: in-place Fisher-Yates shuffle
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Build stimuli for a single trial id
function buildStimuliForId(id, numSystems) {
  const labels = makeLabels(numSystems);           // fixed label order
  const srcOrder = shuffle([...labels]);           // randomized src order
  return labels.map((label, idx) => ({
    // label: `System ${label}`,
    label: `System ${srcOrder[idx]}`,
    src: `https://cdn.jsdelivr.net/gh/${REPO_NAME}/${TEST_VERSION}/${id}_system${srcOrder[idx]}.flac`
  }));
}

let items = Array.from({ length: NUM_SAMPLES }, (_, i) => i + 1); // init array of N items
let sliceId = Math.floor(Math.random() * NUM_SLICES); // sample slice_id
const selected = items.slice(sliceId * SHIFT_SAMPLES, sliceId * SHIFT_SAMPLES + NUM_TRIALS); // select slice, for example [1, 2, 3, 4]

// 1) Create stimuli arrays for each selected item
const stimuliPerTrial = selected.map(id => buildStimuliForId(id, NUM_SYSTEMS));

// 2) Create pages
const pages = stimuliPerTrial.map(stimuli => ({
  type: window.MushraSequentialPlugin,
  stimuli,
  require_slider_interaction: true,
  slider_start: SLIDER_START
}));

// 3) end screen
const end_test = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: `<p>You've completed the test. Thank you for participating!</p>
            <br>
            <p>You will be redirected to Prolific shortly...</p>`,
  choices: "NO_KEYS",
  trial_duration: LAST_PAGE_DURATION
};

const jsPsych = initJsPsych({
  show_progress_bar: true,
  on_finish: function () {
    window.location.href = `${PROLIFIC_URL}=${PROLIFIC_ID}`; 
  }
});

jsPsych.run([
  ...pages,
  end_test
]);
