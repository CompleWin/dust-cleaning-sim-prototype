'use strict';

const roomVertexShader = `
attribute vec2 aCorner;
uniform vec3 uOrigin, uAcross, uAlong;
uniform vec3 uEye, uRight, uUp, uForward;
uniform vec2 uProjection;
varying vec2 vUv;
varying float vDepth;

void main() {
  vUv = aCorner;
  vec3 offset = uOrigin + uAcross * aCorner.x + uAlong * aCorner.y - uEye;
  float depth = dot(offset, uForward);
  vDepth = depth;
  gl_Position = vec4(
    dot(offset, uRight) * uProjection.x,
    dot(offset, uUp) * uProjection.y,
    depth * 1.005 - 0.0802,
    depth
  );
}
`;

const roomFragmentShader = `
precision mediump float;
uniform vec3 uColor;
uniform vec2 uSize;
uniform int uStyle;
uniform sampler2D uDust;
uniform sampler2D uDustGrain;
uniform float uHighlight;
varying vec2 vUv;
varying float vDepth;

void main() {
  vec2 at = vUv * uSize;
  vec2 edge = min(at, uSize - at);
  vec3 color = uColor;

  if (uStyle == 1) {
    float board = floor(at.x / 0.40);
    float groove = 1.0 - smoothstep(0.003, 0.013, mod(at.x, 0.40));
    float seam = 1.0 - smoothstep(0.002, 0.010, mod(at.y + mod(board, 3.0) * 0.65, 1.9));
    color *= 0.96 + mod(board * 13.0, 7.0) * 0.015 - max(groove, seam) * 0.12;
    color *= 0.76 + smoothstep(0.0, 0.27, min(edge.x, edge.y)) * 0.24;
  } else if (uStyle == 2) {
    float border = min(edge.x, edge.y);
    float zigzag = abs(fract(at.x / 0.19) - 0.5) * 0.14;
    float stripe = 1.0 - smoothstep(0.007, 0.021, abs(mod(at.y + zigzag + 0.08, 0.16) - 0.08));
    color = mix(color, vec3(0.66, 0.78, 0.76), stripe * 0.82);
    color = mix(vec3(0.29, 0.40, 0.40), color, smoothstep(0.041, 0.052, border));
  } else if (uStyle == 3) {
    float seam = min(abs(at.x - uSize.x * 0.5), min(edge.x, edge.y) - 0.045);
    color *= mix(0.72, 1.0, smoothstep(0.005, 0.018, seam));
    vec2 handle = abs(vec2(abs(vUv.x - 0.5) - 0.25, vUv.y - 0.68));
    if (handle.x < 0.050 && handle.y < 0.016) color *= 0.60;
  } else if (uStyle == 4) {
    color *= 0.84 + smoothstep(0.0, 0.32, at.y) * 0.16;
    color += vec3(0.06, 0.041, 0.01) * smoothstep(0.53, 1.0, vUv.x);
  } else if (uStyle == 5) {
    color = mix(vec3(0.29, 0.18, 0.15), vec3(0.71, 0.43, 0.23), vUv.x);
    float sun = 1.0 - smoothstep(0.10, 0.11, length((vUv - vec2(0.47, 0.60)) * vec2(1.65, 1.0)));
    float dune = 1.0 - smoothstep(0.01, 0.03, vUv.y - (0.19 + 0.23 * sin(vUv.x * 3.1)));
    color = mix(color, vec3(0.94, 0.77, 0.51), sun);
    color = mix(color, vec3(0.83, 0.55, 0.30), dune);
    if (vUv.y > 0.94) color = vec3(0.86, 0.85, 0.88);
  } else if (uStyle == 6) {
    float blind = 1.0 - smoothstep(0.009, 0.016, mod(at.y, 0.151));
    color = mix(color, vec3(0.97, 0.98, 1.0), blind * 0.78);
    color += 0.10 * smoothstep(0.05, 1.0, vUv.y);
  } else if (uStyle == 7) {
    float beam = 1.0 - smoothstep(0.015, 0.032, mod(at.y, 0.61));
    color *= 1.0 - 0.22 * beam;
  } else if (uStyle == 8) {
    vec2 center = vUv - vec2(0.5, 0.61);
    float circle = 1.0 - smoothstep(0.225, 0.23, length(center));
    float line = step(0.17, vUv.x) * step(vUv.x, 0.83) * step(0.16, vUv.y)
      * step(vUv.y, 0.33) * step(mod(vUv.y, 0.077), 0.014);
    color = mix(color, vec3(1.0, 0.73, 0.38), circle * 0.86);
    color = mix(color, vec3(0.87, 0.90, 0.93), line * 0.71);
  } else if (uStyle == 9) {
    float inset = step(0.08, vUv.x) * step(vUv.x, 0.92) * step(0.06, vUv.y) * step(vUv.y, 0.94);
    color *= 1.0 + inset * 0.13 - (1.0 - smoothstep(0.01, 0.018, abs(vUv.y - 0.52))) * 0.19;
  } else if (uStyle == 10) {
    vec2 key = fract(vUv * vec2(14.0, 4.0));
    float cap = step(0.14, key.x) * step(key.x, 0.86) * step(0.19, key.y) * step(key.y, 0.81);
    color *= 0.56 + 0.44 * cap;
  } else if (uStyle == 11) {
    vec2 globe = vUv - vec2(0.33, 0.51);
    float ocean = 1.0 - step(0.25, length(globe * vec2(1.0, 0.79)));
    float land = step(0.69, sin(globe.x * 20.0 + globe.y * 14.0) * sin(globe.y * 15.0));
    color = mix(color, mix(vec3(0.23, 0.56, 0.82), vec3(0.39, 0.70, 0.47), land), ocean);
    bool textLine = vUv.x > 0.64 && vUv.x < 0.91 && vUv.y > 0.23 && vUv.y < 0.78;
    if (textLine && mod(vUv.y, 0.13) < 0.025) color = vec3(0.71, 0.77, 0.82);
  } else if (uStyle == 12) {
    float trunk = abs(vUv.x - 0.53) + vUv.y * 0.013;
    float branch = abs(vUv.y - (0.67 + abs(vUv.x - 0.53) * 0.48));
    if ((trunk < 0.045 && vUv.y < 0.69) || (branch < 0.019 && abs(vUv.x - 0.53) < 0.30)) {
      color = vec3(0.30, 0.20, 0.13);
    }
  } else if (uStyle == 13) {
    float streak = abs(vUv.y - (vUv.x * 1.13 - 0.045));
    if (streak < 0.023 && vUv.x > 0.20 && vUv.x < 0.80) color = vec3(0.50, 0.82, 1.0);
  } else if (uStyle == 14) {
    vec2 portrait = (vUv - vec2(0.5, 0.51)) * vec2(1.0, 0.74);
    if (length(portrait) < 0.28) {
      color = vec3(0.79, 0.56, 0.43);
      if (vUv.y > 0.66) color = vec3(0.15, 0.15, 0.24);
      else if (vUv.y > 0.53 && vUv.y < 0.61) color = vec3(0.90, 0.90, 0.93);
    }
  } else if (uStyle == 15) {
    float sides = abs(vUv.x - 0.5);
    if (sides < 0.30 && vUv.y > 0.28 && vUv.y < 0.83 - sides * 0.64) {
      color = vec3(0.87, 0.40, 0.19);
      if (vUv.y < 0.44 + sides * 0.43) color = vec3(0.96, 0.76, 0.61);
    }
    if (vUv.y < 0.22 && sides < 0.34) color = vec3(0.22, 0.45, 0.71);
  } else if (uStyle == 16) {
    float band = step(0.24, vUv.y) * step(vUv.y, 0.78);
    color = mix(color, vec3(0.19, 0.17, 0.22), band * 0.75);
    vec2 print = (vUv - vec2(0.07, 0.41)) / vec2(0.90, 0.19);
    if (print.x >= 0.0 && print.x < 1.0 && print.y >= 0.0 && print.y < 1.0) {
      float letter = floor(print.x * 4.0);
      float column = floor(fract(print.x * 4.0) * 4.0);
      float row = floor(print.y * 5.0);
      vec4 bits = vec4(5.0, 5.0, 7.0, 5.0);
      if (row < 1.0) bits = vec4(2.0, 5.0, 7.0, 2.0);
      else if (row < 2.0) bits = vec4(7.0, 5.0, 4.0, 2.0);
      else if (row < 3.0) bits = vec4(5.0, 7.0, 6.0, 2.0);
      else if (row < 4.0) bits = vec4(5.0, 5.0, 4.0, 5.0);
      float glyph = dot(bits, 1.0 - step(0.5, abs(vec4(0.0, 1.0, 2.0, 3.0) - letter)));
      if (column < 3.0 && mod(floor(glyph / exp2(2.0 - column)), 2.0) > 0.5) {
        color = vec3(0.79, 0.76, 0.82);
      }
    }
  }

  vec4 dust = texture2D(uDust, vUv);
  float grain = texture2D(uDustGrain, at / 2.2).a;
  float density = min(1.0, dust.a * 1.65);
  float buildup = smoothstep(0.25, 0.75, dust.r);
  float brightness = dot(uColor, vec3(0.299, 0.587, 0.114));
  float lightSurface = smoothstep(0.34, 0.67, brightness);
  vec3 filmColor = mix(vec3(0.80, 0.72, 0.59), vec3(0.57, 0.46, 0.35), lightSurface);
  vec3 grainColor = mix(vec3(0.98, 0.89, 0.73), vec3(0.40, 0.31, 0.23), lightSurface);
  color = mix(color, filmColor, density * mix(0.24, 0.71, buildup));
  color = mix(color, grainColor, density * grain * mix(0.48, 0.92, buildup));
  color = mix(color, vec3(1.0, 0.76, 0.31), density * uHighlight * mix(0.78, 1.0, grain));
  color = mix(color, vec3(0.78, 0.76, 0.83), smoothstep(1.0, 12.0, vDepth) * 0.14);

  gl_FragColor = vec4(color, 1.0);
}
`;

class RoomRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;

    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, roomVertexShader], [gl.FRAGMENT_SHADER, roomFragmentShader]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    this.uniforms = {};
    const uniformNames = ['Origin', 'Across', 'Along', 'Eye', 'Right', 'Up', 'Forward', 'Projection',
      'Color', 'Size', 'Style', 'Dust', 'DustGrain', 'Highlight'];
    for (const name of uniformNames) this.uniforms[name] = gl.getUniformLocation(program, 'u' + name);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, 'aCorner');
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.11, 0.12, 0.18, 1);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.blank = this.createDustTexture(1, 1);
    gl.uniform1i(this.uniforms.Dust, 0);
    gl.activeTexture(gl.TEXTURE1);
    this.createDustGrainTexture();
    gl.uniform1i(this.uniforms.DustGrain, 1);
    gl.activeTexture(gl.TEXTURE0);
  }

  createDustGrainTexture() {
    const gl = this.gl;
    const size = 512;
    const pixels = new Uint8Array(size * size);
    let seed = 47;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    function scatterGrain(x, y, radius, opacity) {
      const angle = random() * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const width = radius * (0.40 + random() * 0.52);
      for (let row = Math.floor(y - radius); row <= Math.ceil(y + radius); row++) {
        for (let column = Math.floor(x - radius); column <= Math.ceil(x + radius); column++) {
          const dx = column + 0.5 - x;
          const dy = row + 0.5 - y;
          const along = (dx * cos + dy * sin) / radius;
          const across = (dy * cos - dx * sin) / width;
          const coverage = Math.max(0, 1 - along * along - across * across);
          const index = ((row + size) % size) * size + (column + size) % size;
          pixels[index] = Math.max(pixels[index], Math.round(255 * opacity * coverage));
        }
      }
    }

    for (let i = 0; i < 3600; i++) {
      scatterGrain(random() * size, random() * size, 0.9 + random() * 1.9, 0.45 + random() * 0.55);
    }
    for (let i = 0; i < 460; i++) {
      const x = random() * size;
      const y = random() * size;
      scatterGrain(x, y, 2.6 + random() * 2.6, 0.60 + random() * 0.35);
      for (let fleck = 0; fleck < 5; fleck++) {
        scatterGrain(x + (random() - 0.5) * 14, y + (random() - 0.5) * 14, 1 + random() * 1.8, 0.70);
      }
    }

    // Mipmaps keep subpixel grains from flickering as the player moves.
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, size, size, 0, gl.ALPHA, gl.UNSIGNED_BYTE, pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  createDustTexture(width, height) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, width, height, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, null);
    return texture;
  }

  updateDustTexture(dust) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, dust.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, dust.columns, dust.rows, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, dust.pixels);
  }

  beginFrame() {
    const { canvas, gl, uniforms } = this;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(canvas.clientWidth * scale));
    const height = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const focal = 1 / Math.tan(35 * Math.PI / 180);
    const aspect = width / height;
    gl.uniform2f(uniforms.Projection, focal / Math.max(1, aspect), focal * Math.min(1, aspect));
  }

  setCamera(eye, right, up, forward) {
    const { gl, uniforms } = this;
    gl.uniform3fv(uniforms.Eye, eye);
    gl.uniform3fv(uniforms.Right, right);
    gl.uniform3fv(uniforms.Up, up);
    gl.uniform3fv(uniforms.Forward, forward);
  }

  draw(face, highlight = 0, offset = null) {
    const { gl, uniforms } = this;
    const { origin, across, along, color, style, width, height, dust, triangle } = face;
    gl.uniform3fv(uniforms.Origin, offset ? origin.map((value, axis) => value + offset[axis]) : origin);
    gl.uniform3fv(uniforms.Across, across);
    gl.uniform3fv(uniforms.Along, along);
    gl.uniform3fv(uniforms.Color, color);
    gl.uniform2f(uniforms.Size, width, height);
    gl.uniform1i(uniforms.Style, style);
    gl.bindTexture(gl.TEXTURE_2D, dust?.texture ?? this.blank);
    gl.uniform1f(uniforms.Highlight, dust ? highlight : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, triangle ? 3 : 4);
  }

  beginEquipment() {
    this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
    this.setCamera([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, -1]);
  }
}
