'use strict';

class CleaningAudio {
  start() {
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      try {
        this.setup(new Audio());
      } catch (error) {
        console.warn('Звуки уборки недоступны', error);
        return;
      }
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
  }

  setup(context) {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = () => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.start(0, Math.random() * 2);
      return source;
    };
    const filter = (type, frequency, quality) => {
      const node = context.createBiquadFilter();
      node.type = type;
      node.frequency.value = frequency;
      node.Q.value = quality;
      return node;
    };
    const gain = value => {
      const node = context.createGain();
      node.gain.value = value;
      return node;
    };
    const master = gain(0.7);
    master.connect(context.destination);
    const vacuum = gain(0);
    const crackle = gain(0);
    const rag = gain(0);
    const brush = gain(0);
    for (const channel of [vacuum, crackle, rag, brush]) channel.connect(master);

    const vacuumFilter = filter('lowpass', 1300, 0.7);
    noise().connect(vacuumFilter).connect(vacuum);
    const motor = context.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.value = 118;
    motor.connect(filter('lowpass', 420, 1)).connect(gain(0.35)).connect(vacuum);
    motor.start();
    noise().connect(filter('highpass', 2500, 0.7)).connect(crackle);
    noise().connect(filter('bandpass', 900, 0.8)).connect(rag);
    noise().connect(filter('bandpass', 3800, 1.6)).connect(brush);

    this.nodes = { master, vacuum, crackle, rag, brush, vacuumFilter, motor };
    this.context = context;
  }

  update(tool, active, removed = 0, speed = 0) {
    if (!this.context) return;
    const { vacuum, crackle, rag, brush, vacuumFilter, motor } = this.nodes;
    const now = this.context.currentTime;
    const vacuuming = active && tool === 0;
    vacuum.gain.setTargetAtTime(vacuuming ? 0.16 : 0, now, 0.08);
    motor.frequency.setTargetAtTime(vacuuming ? 118 + Math.min(30, removed * 1.5) : 90, now, 0.10);
    vacuumFilter.frequency.setTargetAtTime(vacuuming && removed > 0.5 ? 2000 : 1300, now, 0.10);
    crackle.gain.setTargetAtTime(vacuuming ? Math.min(0.12, removed * 0.006) * (0.4 + Math.random() * 0.6) : 0, now, 0.02);
    rag.gain.setTargetAtTime(active && tool === 1 ? 0.04 + speed * 0.5 : 0, now, 0.05);
    brush.gain.setTargetAtTime(active && tool === 2 ? (0.03 + speed * 0.32) * (0.55 + Math.random() * 0.45) : 0, now, 0.02);
  }

  chime(won) {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const notes = won ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [1318.5, 1975.5, 2637];
    notes.forEach((frequency, index) => {
      const at = now + index * 0.085;
      const tone = this.context.createOscillator();
      const volume = this.context.createGain();
      tone.type = won ? 'triangle' : 'sine';
      tone.frequency.value = frequency;
      volume.gain.setValueAtTime(0.0001, at);
      volume.gain.exponentialRampToValueAtTime(0.11, at + 0.012);
      volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
      tone.connect(volume).connect(this.nodes.master);
      tone.start(at);
      tone.stop(at + 0.75);
    });
  }
}
