/* =========================================
   Плиточник.НСК — Redesign / JavaScript
   Без сборщиков, без зависимостей (ESM-импорт three по CDN).
   ========================================= */

(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  /* ---------- helpers ---------- */
  var $  = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp  = function (a, b, t) { return a + (b - a) * t; };

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* =========================
     1. HERO 3D (Three.js)
     ========================= */

  var heroCanvasWrap = $('#heroCanvas');


  // Устройство считаем слабым: экономия трафика, либо телефон с <=4 ядрами
  // и <=4 ГБ ОЗУ. Десктопы с теми же цифрами WebGL ещё тянут.
  function isWeakDevice() {
    if (navigator.connection && navigator.connection.saveData) return true;
    var cores = navigator.hardwareConcurrency || 8;
    var mem = navigator.deviceMemory || 8;
    if (cores <= 2) return true;
    if (isTouch && cores <= 4 && mem <= 4) return true;
    return false;
  }

  // Пробный getContext() не делаем: он держит лишний WebGL-контекст.
  // Реальный отказ поймает try/catch вокруг new WebGLRenderer().
  function webglSupported() {
    return !!(window.WebGLRenderingContext || window.WebGL2RenderingContext);
  }

  var isTouch = window.matchMedia('(pointer: coarse)').matches ||
                navigator.maxTouchPoints > 0;

  // Статичный фон hero-bg.webp остаётся в DOM во всех случаях.
  // WebGL — только «украшение», поэтому любой отказ = тихий откат к статике.
  var want3D = !!heroCanvasWrap && !reduced.matches && !isWeakDevice() && webglSupported();
  if (want3D) initHero3D();

  function initHero3D() {
    var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

    var started = false;
    var startedAt = 0;
    var alive = false;        // RAF крутится?
    var rafId = null;
    var inView = true;        // hero в зоне видимости?
    var tabVisible = !doc.hidden;
    var pointer = { x: 0, y: 0 };   // целевое значение (-1..1)
    var smooth = { x: 0, y: 0 };    // текущее (демпфированное)
    var scrollT = 0;                 // прогресс прокрутки hero 0..1
    var scrollSmooth = 0;
    var disposed = false;
    var teardown = null;             // освобождение сцены, задаёт buildScene()

    // Ленивый старт: инициализируем, когда hero близко к вьюпорту.
    var bootIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          bootIO.disconnect();
          boot();
        }
      });
    }, { rootMargin: '250px 0px' });

    if (heroCanvasWrap) bootIO.observe(heroCanvasWrap);

    // Пользователь включил «уменьшить движение» — убираем сцену, остаётся статика.
    function onReducedChange() { if (reduced.matches) dispose(); }
    if (reduced.addEventListener) reduced.addEventListener('change', onReducedChange);

    function dispose() {
      if (disposed) return;
      disposed = true;
      bootIO.disconnect();
      if (reduced.removeEventListener) reduced.removeEventListener('change', onReducedChange);
      if (teardown) teardown();
      doc.body.classList.remove('webgl-on');
      if (heroCanvasWrap) heroCanvasWrap.remove();
    }

    function boot() {
      if (started) return;
      started = true;

      import(THREE_URL)
        .then(function (THREE) { if (!disposed) buildScene(THREE); })
        .catch(function () {
          // Сеть/CDN недоступны, импорт не поддержан или WebGL не создался —
          // остаёмся на статике.
          dispose();
        });
    }

    function buildScene(THREE) {
      var wrap = heroCanvasWrap;
      var W = wrap.clientWidth || window.innerWidth;
      var H = wrap.clientHeight || window.innerHeight;

      // На телефонах DPR выше 1.5 почти не виден, а GPU грузит вдвое сильнее.
      var maxDpr = isTouch ? 1.5 : 2;

      var renderer = new THREE.WebGLRenderer({
        antialias: W < 900,       // на мобильных — без AA, дешевле
        alpha: true,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
      renderer.setSize(W, H, false);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.55;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      wrap.appendChild(renderer.domElement);

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
      camera.position.set(0, 0.85, 10.2);
      camera.lookAt(0, -0.05, 0);

      /* --- процедурное окружение (без внешних HDR) --- */
      var envCanvas = doc.createElement('canvas');
      envCanvas.width = 512; envCanvas.height = 256;
      var ectx = envCanvas.getContext('2d');

      var g = ectx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0.00, '#2a2f36');
      g.addColorStop(0.42, '#15181c');
      g.addColorStop(0.72, '#0d0f12');
      g.addColorStop(1.00, '#191c20');
      ectx.fillStyle = g;
      ectx.fillRect(0, 0, 512, 256);

      // тёплые «источники света» в эквирект-проекции → блики на лаке
      [[118, 74, 96, '#ffe0b0'], [352, 96, 72, '#ffb37a'], [256, 44, 130, '#8fb4d8']]
        .forEach(function (s) {
          var rg = ectx.createRadialGradient(s[0], s[1], 0, s[0], s[1], s[2]);
          rg.addColorStop(0, s[3]);
          rg.addColorStop(1, 'rgba(0,0,0,0)');
          ectx.fillStyle = rg;
          ectx.fillRect(0, 0, 512, 256);
        });

      var envTex = new THREE.CanvasTexture(envCanvas);
      envTex.mapping = THREE.EquirectangularReflectionMapping;
      envTex.colorSpace = THREE.SRGBColorSpace;
      var pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      scene.environment = pmrem.fromEquirectangular(envTex).texture;
      envTex.dispose();
      pmrem.dispose();

      /* --- свет --- */
      var key = new THREE.DirectionalLight(0xffd9ac, 2.6);
      key.position.set(3.5, 4.2, 5);
      scene.add(key);

      var rim = new THREE.DirectionalLight(0x9dc0e6, 1.35);
      rim.position.set(-4.5, -1.4, 2.5);
      scene.add(rim);

      var fill = new THREE.DirectionalLight(0xffe9cc, 0.9);
      fill.position.set(-1.5, 2.5, 6);
      scene.add(fill);

      scene.add(new THREE.AmbientLight(0x3a424c, 0.9));

      /* --- геометрия плитки: скруглённый прямоугольник + фаска --- */
      function tileGeometry(w, h, d, r) {
        var s = new THREE.Shape();
        var x = -w / 2, y = -h / 2;
        s.moveTo(x + r, y);
        s.lineTo(x + w - r, y);
        s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r);
        s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h);
        s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r);
        s.quadraticCurveTo(x, y, x + r, y);

        var geo = new THREE.ExtrudeGeometry(s, {
          depth: d,
          bevelEnabled: true,
          bevelThickness: 0.018,
          bevelSize: 0.018,
          bevelSegments: 2,
          curveSegments: 4
        });
        geo.center();
        return geo;
      }

      // Один экземпляр геометрии на все плитки — минимум памяти и батчей.
      var geoTile = tileGeometry(0.92, 0.92, 0.14, 0.07);
      var geoSlab = tileGeometry(1.42, 1.42, 0.16, 0.05);

      /* --- материалы: MeshPhysicalMaterial с лаковым бликом --- */
      function tileMaterial(hex, rough, metal) {
        return new THREE.MeshPhysicalMaterial({
          color: hex,
          roughness: rough,
          metalness: metal,
          clearcoat: 1.0,
          clearcoatRoughness: 0.08,
          envMapIntensity: 1.1,
          reflectivity: 0.65
        });
      }
      // Яркая палитра: у каждой плитки свой неоновый контур того же тона.
      var PALETTE = [
        { body: 0xffb020, neon: 0xffa31a, rough: 0.24, metal: 0.30 },  // янтарь
        { body: 0x1fcf8f, neon: 0x14ff9a, rough: 0.26, metal: 0.05 },  // мятный
        { body: 0x10d4f0, neon: 0x00e5ff, rough: 0.22, metal: 0.10 },  // бирюза
        { body: 0x9f8ce8, neon: 0xb6a6ff, rough: 0.28, metal: 0.05 },  // приглушённая лаванда
        { body: 0x56606c, neon: 0x3df2ff, rough: 0.16, metal: 0.15 }   // графит с голубым неоном
      ];
      var mats = PALETTE.map(function (p) {
        var m = tileMaterial(p.body, p.rough, p.metal);
        // лёгкое собственное свечение — плитка не тонет в темноте
        m.emissive = new THREE.Color(p.body);
        m.emissiveIntensity = 0.28;
        return m;
      });

      /* --- неон: светящийся контур на лицевой грани + ореол позади --- */
      function neonFrameGeometry(w, h, r, t, z) {
        function rr(path, x, y, w2, h2, r2) {
          path.moveTo(x + r2, y);
          path.lineTo(x + w2 - r2, y);
          path.quadraticCurveTo(x + w2, y, x + w2, y + r2);
          path.lineTo(x + w2, y + h2 - r2);
          path.quadraticCurveTo(x + w2, y + h2, x + w2 - r2, y + h2);
          path.lineTo(x + r2, y + h2);
          path.quadraticCurveTo(x, y + h2, x, y + h2 - r2);
          path.lineTo(x, y + r2);
          path.quadraticCurveTo(x, y, x + r2, y);
        }
        var outer = new THREE.Shape();
        rr(outer, -w / 2, -h / 2, w, h, r);
        var hole = new THREE.Path();
        rr(hole, -w / 2 + t, -h / 2 + t, w - 2 * t, h - 2 * t, Math.max(r - t, 0.01));
        outer.holes.push(hole);
        var geo = new THREE.ShapeGeometry(outer, 6);
        geo.translate(0, 0, z);
        return geo;
      }

      // Текстура ореола: размытая рамка на прозрачном фоне (рисуется один раз).
      var glowCanvas = doc.createElement('canvas');
      glowCanvas.width = glowCanvas.height = 256;
      var gctx = glowCanvas.getContext('2d');
      gctx.strokeStyle = '#ffffff';
      gctx.shadowColor = '#ffffff';
      gctx.lineWidth = 14;
      [44, 24, 10].forEach(function (blur) {
        gctx.shadowBlur = blur;
        gctx.beginPath();
        if (gctx.roundRect) gctx.roundRect(58, 58, 140, 140, 14);
        else gctx.rect(58, 58, 140, 140);
        gctx.stroke();
      });
      var glowTex = new THREE.CanvasTexture(glowCanvas);
      glowTex.colorSpace = THREE.SRGBColorSpace;

      var neonMats = PALETTE.map(function (p) {
        return new THREE.MeshBasicMaterial({ color: p.neon, toneMapped: false });
      });
      var glowMats = PALETTE.map(function (p) {
        return new THREE.MeshBasicMaterial({
          color: p.neon, map: glowTex, transparent: true, opacity: 1,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
        });
      });
      var neonBase = PALETTE.map(function (p) { return new THREE.Color(p.neon); });

      /* --- детерминированный псевдослучайный --- */
      var seed = 20261023;
      function rnd() {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      // Хаотичная раскладка цветов: случайно, но без одинаковых соседей
      // слева и сверху — иначе глаз видит полосы и пятна.
      function pickColor(grid, r, c) {
        var avoid = {};
        if (c > 0) avoid[grid[r][c - 1]] = 1;
        if (r > 0) avoid[grid[r - 1][c]] = 1;
        var free = [];
        for (var k = 0; k < mats.length; k++) if (!avoid[k]) free.push(k);
        return free[Math.floor(rnd() * free.length)];
      }

      /* --- сборка сцены: стена + пол --- */
      var root3d = new THREE.Group();
      scene.add(root3d);

      // Плитки рисуются через InstancedMesh: по одному на пару
      // «геометрия + материал» — до 10 draw calls вместо ~90.
      var tiles = [];      // { geo, mat, pos, rot, to, delay, phase, im, idx }
      var SPACING = 1.02;

      function addWall(cols, rows, originY) {
        var wallGrid = [];
        for (var gr = 0; gr < rows; gr++) wallGrid.push([]);
        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            var useSlab = (r === 1 && (c === cols - 2 || c === 2));
            var x = (c - (cols - 1) / 2) * (useSlab ? 1.52 : SPACING);
            var y = originY - r * (useSlab ? 1.52 : SPACING);

            // разброс при сборке: плитки «прилетают» с разных сторон
            var dist = Math.abs(r - (rows - 1) / 2) + Math.abs(c - (cols - 1) / 2);
            var mi = pickColor(wallGrid, r, c);
            wallGrid[r][c] = mi;
            var ang = rnd() * Math.PI * 2;
            var rad = 3.2 + rnd() * 6.5;
            tiles.push({
              geo: useSlab ? 1 : 0,
              mat: mi,
              pos: {
                x: x + Math.cos(ang) * rad,
                y: y + Math.sin(ang) * rad * 0.75,
                z: -3 - rnd() * 7
              },
              rot: {
                x: (rnd() - 0.5) * 3.2,
                y: (rnd() - 0.5) * 3.2,
                z: (rnd() - 0.5) * 2.6
              },
              to: { x: x, y: y, z: 0 },
              delay: dist * 0.055 + rnd() * 0.12,
              phase: rnd() * Math.PI * 2
            });
          }
        }
      }

      function addFloor(cols, rows, y) {
        var floorGrid = [];
        for (var gr = 0; gr < rows; gr++) floorGrid.push([]);
        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            var x = (c - (cols - 1) / 2) * 1.52;
            var z = -(r * 1.52) + 1.2;
            var rx = -Math.PI / 2 + (rnd() - 0.5) * 1.6;
            var rz = (rnd() - 0.5) * 1.6;
            tiles.push({
              geo: 1,
              mat: (floorGrid[r][c] = pickColor(floorGrid, r, c)),
              pos: { x: x + (rnd() - 0.5) * 5, y: y - 2.5 - rnd() * 5, z: z - 2 - rnd() * 4 },
              rot: { x: rx, y: 0, z: rz },
              to: { x: x, y: y, z: z },
              delay: 0.15 + r * 0.05 + rnd() * 0.1,
              phase: rnd() * Math.PI * 2,
              floor: true
            });
          }
        }
      }

      // адаптивная плотность: на узких экранах меньше плиток
      var compact = W < 760;
      addWall(compact ? 7 : 9, compact ? 5 : 6, compact ? 1.6 : 2.0);
      addFloor(compact ? 5 : 7, compact ? 4 : 5, compact ? -2.5 : -3.0);

      // раскладываем плитки по InstancedMesh
      var geos = [geoTile, geoSlab];
      // контур чуть выше лицевой грани (фаска ~0.088), ореол — позади плитки;
      // ореол на 1.83 больше плитки: рамка в текстуре занимает 140/256
      var frameGeos = [
        neonFrameGeometry(0.93, 0.93, 0.075, 0.042, 0.095),
        neonFrameGeometry(1.43, 1.43, 0.055, 0.048, 0.105)
      ];
      var glowGeos = [
        new THREE.PlaneGeometry(0.93 * 1.83, 0.93 * 1.83).translate(0, 0, -0.11),
        new THREE.PlaneGeometry(1.43 * 1.83, 1.43 * 1.83).translate(0, 0, -0.12)
      ];
      var groups = {};
      tiles.forEach(function (t) {
        var k = t.geo + ':' + t.mat;
        (groups[k] = groups[k] || []).push(t);
      });
      var instanced = [];
      Object.keys(groups).forEach(function (k) {
        var list = groups[k];
        var gi = list[0].geo, mi = list[0].mat;
        // на каждую группу три слоя: плитка, неоновый контур, ореол
        var layers = [
          new THREE.InstancedMesh(geos[gi], mats[mi], list.length),
          new THREE.InstancedMesh(frameGeos[gi], neonMats[mi], list.length),
          new THREE.InstancedMesh(glowGeos[gi], glowMats[mi], list.length)
        ];
        layers[2].renderOrder = 1;   // прозрачный ореол — после непрозрачных
        layers.forEach(function (im) {
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          // плитки разлетаются за пределы исходного bounding sphere
          im.frustumCulled = false;
          root3d.add(im);
          instanced.push(im);
        });
        list.forEach(function (t, i) { t.layers = layers; t.idx = i; });
      });

      var dummy = new THREE.Object3D();
      function writeMatrix(t) {
        dummy.position.set(t.pos.x, t.pos.y, t.pos.z);
        dummy.rotation.set(t.rot.x, t.rot.y, t.rot.z);
        dummy.updateMatrix();
        for (var j = 0; j < 3; j++) t.layers[j].setMatrixAt(t.idx, dummy.matrix);
      }
      function flushMatrices() {
        for (var i = 0; i < instanced.length; i++) instanced[i].instanceMatrix.needsUpdate = true;
      }

      root3d.rotation.y = compact ? -0.08 : -0.24;
      var baseRotX = compact ? 0.03 : -0.05;
      // смещаем стену вправо — там, где её не перекрывает текст
      var baseX = compact ? 0.2 : 1.7;

      /* --- сборка (анимация появления) --- */
      var ASSEMBLE = 1.5;   // секунды
      var settled = false;

      function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

      function applyAssemble(elapsed) {
        var all = true;
        for (var i = 0; i < tiles.length; i++) {
          var t = tiles[i];
          var local = clamp((elapsed - t.delay) / ASSEMBLE, 0, 1);
          var e = easeOutCubic(local);
          t.pos.x = lerp(t.fx, t.to.x, e);
          t.pos.y = lerp(t.fy, t.to.y, e);
          t.pos.z = lerp(t.fz, t.to.z, e);
          t.rot.x = lerp(t.rx, 0, e);
          t.rot.y = lerp(t.ry, 0, e);
          t.rot.z = lerp(t.rz, 0, e);
          writeMatrix(t);
          if (local < 1) all = false;
        }
        flushMatrices();
        settled = all;
      }

      // фиксируем стартовые координаты
      tiles.forEach(function (t) {
        t.fx = t.pos.x;
        t.fy = t.pos.y;
        t.fz = t.pos.z;
        t.rx = t.rot.x;
        t.ry = t.rot.y;
        t.rz = t.rot.z;
      });

      /* --- ввод: мышь / тач --- */
      function onPointer(e) {
        var w = window.innerWidth, h = window.innerHeight;
        var cx = (e.touches ? e.touches[0].clientX : e.clientX);
        var cy = (e.touches ? e.touches[0].clientY : e.clientY);
        pointer.x = clamp((cx / w) * 2 - 1, -1, 1);
        pointer.y = clamp((cy / h) * 2 - 1, -1, 1);
      }

      /* --- скролл --- */
      var heroEl = $('#hero');
      function onScroll() {
        var hgt = heroEl.offsetHeight || window.innerHeight;
        scrollT = clamp(window.scrollY / Math.max(hgt, 1), 0, 1);
      }
      onScroll();

      /* --- resize --- */
      var resizeTimer;
      function onResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          var nw = wrap.clientWidth, nh = wrap.clientHeight;
          if (!nw || !nh) return;
          camera.aspect = nw / nh;
          // на узких экранах камера ближе — сетка не обрезается
          camera.position.z = nw < 760 ? 9.2 : 10.4;
          camera.updateProjectionMatrix();
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
          renderer.setSize(nw, nh, false);
        }, 160);
      }

      /* --- пауза: вкладка скрыта / hero вне вида --- */
      function onVisibility() {
        tabVisible = !doc.hidden;
        if (tabVisible && inView) start(); else stop();
      }

      var viewIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          inView = e.isIntersecting;
          if (inView && tabVisible) start(); else stop();
        });
      }, { threshold: 0 });
      viewIO.observe(wrap);

      // bfcache: страница может вернуться — только пауза; иначе освобождаем всё
      function onPageHide(e) {
        if (e.persisted) stop(); else dispose();
      }

      var listeners = [
        [window, 'pointermove', onPointer, { passive: true }],
        [window, 'scroll', onScroll, { passive: true }],
        [window, 'resize', onResize, { passive: true }],
        [window, 'orientationchange', onResize, { passive: true }],
        [window, 'pagehide', onPageHide],
        [doc, 'visibilitychange', onVisibility]
      ];
      listeners.forEach(function (l) { l[0].addEventListener(l[1], l[2], l[3]); });

      teardown = function () {
        stop();
        clearTimeout(resizeTimer);
        viewIO.disconnect();
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        instanced.forEach(function (im) { im.dispose(); });
        geos.concat(frameGeos, glowGeos).forEach(function (g) { g.dispose(); });
        mats.concat(neonMats, glowMats).forEach(function (m) { m.dispose(); });
        glowTex.dispose();
        if (scene.environment) scene.environment.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };

      function start() {
        if (alive || !started || disposed) return;
        alive = true;
        startedAt = startedAt || performance.now();
        rafId = requestAnimationFrame(tick);
      }
      function stop() {
        if (!alive) return;
        alive = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        last = 0;
      }

      var last = 0;
      var lastRender = 0;
      var frameBudget = 1000 / 60;   // мс между отрисовками
      var IDLE_BUDGET = 1000 / 24;   // сцена собрана и не движется — только «дыхание»
      var avgDt = 16.7;

      function tick(now) {
        rafId = requestAnimationFrame(tick);

        if (last) avgDt = avgDt * 0.9 + (now - last) * 0.1;
        var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
        last = now;

        // Простой: сборка закончена, мышь и скролл «догнаны».
        var idle = settled &&
          Math.abs(smooth.x - pointer.x) < 0.002 &&
          Math.abs(smooth.y - pointer.y) < 0.002 &&
          Math.abs(scrollSmooth - scrollT) < 0.002;

        // Адаптивный бюджет: на слабом железе рисуем реже, освобождая
        // главный поток для IntersectionObserver (reveal) и CSS-анимаций.
        var budget = idle ? Math.max(frameBudget, IDLE_BUDGET) : frameBudget;
        if (now - lastRender < budget - 1) return;
        lastRender = now;

        if (avgDt > 45) frameBudget = 1000 / 22;
        else if (avgDt > 30) frameBudget = 1000 / 28;
        else if (avgDt < 19 && frameBudget < 1000 / 60) {
          frameBudget = Math.max(frameBudget * 0.96, 1000 / 60);
        }

        var elapsed = (now - startedAt) / 1000;
        if (!settled) applyAssemble(elapsed);

        // демпфирование параллакса
        smooth.x = lerp(smooth.x, pointer.x, 1 - Math.pow(0.001, dt));
        smooth.y = lerp(smooth.y, pointer.y, 1 - Math.pow(0.001, dt));
        scrollSmooth = lerp(scrollSmooth, scrollT, 1 - Math.pow(0.004, dt));

        // мягкий параллакс от мыши + скролла
        root3d.rotation.y = -0.24 + smooth.x * 0.16 + scrollSmooth * 0.1;
        root3d.rotation.x = baseRotX + smooth.y * 0.1 - scrollSmooth * 0.14;
        root3d.position.x = baseX;
        root3d.position.y = -scrollSmooth * 1.9;
        root3d.position.z = scrollSmooth * 1.6;

        // «дыхание» плиток пола после сборки
        if (settled) {
          var t = now / 1000;
          for (var i = 0; i < tiles.length; i++) {
            var tl = tiles[i];
            if (!tl.floor) continue;
            tl.pos.z = tl.to.z + Math.sin(t * 0.7 + tl.phase) * 0.02;
            writeMatrix(tl);
          }
          flushMatrices();
        }

        // неон «дышит»: у каждого цвета своя фаза, лёгкое мерцание
        var tn = now / 1000;
        for (var n = 0; n < neonMats.length; n++) {
          var pulse = 0.78 + 0.22 * Math.sin(tn * 1.6 + n * 1.3);
          neonMats[n].color.copy(neonBase[n]).multiplyScalar(pulse * 1.25);
          glowMats[n].opacity = 0.75 + 0.25 * pulse;
        }

        renderer.render(scene, camera);
      }

      // первый кадр
      applyAssemble(0);
      renderer.render(scene, camera);
      doc.body.classList.add('webgl-on');
      if (inView && tabVisible) start();
    }
  }

  /* =========================
     2. HEADER / NAV
     ========================= */

  var header = $('#header');
  var burger = $('#burger');
  var nav = $('#nav');
  var navOverlay = $('#navOverlay');

  function onScrollHeader() {
    header.classList.toggle('scrolled', window.scrollY > 40);
  }
  window.addEventListener('scroll', onScrollHeader, { passive: true });
  onScrollHeader();

  // Пока открыто меню или лайтбокс, остальная страница недоступна
  // для Tab и скринридеров (inert), фокус остаётся внутри.
  function setInert(keep, on) {
    Array.prototype.forEach.call(doc.body.children, function (el) {
      if (keep.indexOf(el) !== -1 || el.tagName === 'SCRIPT') return;
      if (on) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    });
  }

  // Tab по кругу внутри контейнера (для браузеров без поддержки inert)
  function trapTab(e, box) {
    if (e.key !== 'Tab') return;
    var items = $$('a[href], button:not([disabled])', box).filter(function (el) {
      return el.offsetParent !== null;
    });
    if (!items.length) return;
    var first = items[0], lastEl = items[items.length - 1];
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && doc.activeElement === lastEl) { e.preventDefault(); first.focus(); }
  }

  function navIsOpen() { return !!nav && nav.classList.contains('open'); }

  function closeNav(restoreFocus) {
    if (!navIsOpen()) return;
    nav.classList.remove('open');
    navOverlay.classList.remove('active');
    burger.classList.remove('active');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Открыть меню');
    doc.body.style.overflow = '';
    setInert([header, navOverlay], false);
    if (restoreFocus) burger.focus();
  }
  function openNav() {
    nav.classList.add('open');
    navOverlay.classList.add('active');
    burger.classList.add('active');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Закрыть меню');
    doc.body.style.overflow = 'hidden';
    setInert([header, navOverlay], true);
    var first = $('a', nav);
    if (first) first.focus();
  }
  function toggleNav() {
    if (navIsOpen()) closeNav(true); else openNav();
  }
  if (burger) burger.addEventListener('click', toggleNav);
  if (navOverlay) navOverlay.addEventListener('click', function () { closeNav(true); });
  // переход по якорю: фокус уходит к разделу, на бургер не возвращаем
  $$('.nav a').forEach(function (a) { a.addEventListener('click', function () { closeNav(false); }); });
  // меню на десктопе не открывается, но если окно расширили при открытом — закрываем
  window.addEventListener('resize', function () {
    if (navIsOpen() && getComputedStyle(burger).display === 'none') closeNav(false);
  }, { passive: true });

  /* активный пункт навигации */
  var navLinks = $$('.nav a');
  var sections = $$('section[id]');
  var navIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var id = e.target.id;
      navLinks.forEach(function (l) {
        l.classList.toggle('active', l.getAttribute('href') === '#' + id);
      });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach(function (s) { navIO.observe(s); });

  /* =========================
     3. REVEAL
     ========================= */
  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        revealIO.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  $$('.reveal').forEach(function (el) { revealIO.observe(el); });

  /* =========================
     4. СЧЁТЧИКИ
     ========================= */
  var countIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      animate(e.target);
      countIO.unobserve(e.target);
    });
  }, { threshold: 0.2 });

  // В HTML лежит реальное число (его видят поисковики и браузеры без JS),
  // с нуля докручиваем только когда счётчик появился в зоне видимости.
  function animate(el) {
    var target = parseInt(el.getAttribute('data-target'), 10) || 0;
    if (reduced.matches) { setNum(el, target); return; }
    var dur = 1600, t0 = performance.now();
    function frame(now) {
      var p = clamp((now - t0) / dur, 0, 1);
      var e = 1 - Math.pow(1 - p, 3);
      setNum(el, Math.floor(e * target));
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function setNum(el, val) {
    var suf = el.querySelector('span');
    if (suf) el.innerHTML = val + suf.outerHTML;
    else el.textContent = val;
  }
  $$('[data-target]').forEach(function (el) { countIO.observe(el); });

  /* =========================
     5. TILT-КАРТОЧКИ (CSS perspective)
     ========================= */
  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var tilts = $$('.tilt');

  if (canHover && !reduced.matches) {
    tilts.forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', (px * 100) + '%');
        card.style.setProperty('--my', (py * 100) + '%');
        var ry = (px - 0.5) * 13;
        var rx = -(py - 0.5) * 10;
        card.style.transform = 'perspective(900px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateZ(0)';
      });
      card.addEventListener('pointerleave', function () {
        card.style.transform = '';
      });
    });
  } else {
    // тач/слабые устройства — без 3D-наклона
    doc.body.classList.add('motion-lite');
  }

  /* =========================
     6. ПОРТФОЛИО: глубина + фильтр
     ========================= */
  var depthItems = $$('.portfolio-item.depth');
  var ticking = false;

  function updateDepth() {
    if (reduced.matches || !depthItems.length) return;
    var vh = window.innerHeight;
    depthItems.forEach(function (it) {
      if (!it.classList.contains('visible') || it.classList.contains('is-hidden')) return;
      var r = it.getBoundingClientRect();
      var center = r.top + r.height / 2 - vh / 2;
      var d = parseFloat(it.getAttribute('data-depth')) || 0.05;
      var dy = clamp(center / vh, -1, 1) * d * 340;
      it.style.transform = 'translateY(' + dy.toFixed(1) + 'px)';
    });
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(updateDepth); }
  }, { passive: true });
  window.addEventListener('resize', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(updateDepth); }
  }, { passive: true });

  var filterBtns = $$('.filter-btn');
  var portItems = $$('.portfolio-item');

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterBtns.forEach(function (b) {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      var f = btn.getAttribute('data-filter');
      var grid = doc.querySelector('.portfolio-grid');
      if (grid) grid.classList.toggle('is-filtered', f !== 'all');
      portItems.forEach(function (it) {
        var match = (f === 'all' || it.getAttribute('data-category') === f);
        it.classList.toggle('is-hidden', !match);
        if (match && !reduced.matches) {
          it.animate(
            [{ opacity: 0, transform: 'translateY(16px) scale(.97)' },
             { opacity: 1, transform: 'translateY(0) scale(1)' }],
            { duration: 420, easing: 'cubic-bezier(.22,.61,.36,1)' }
          );
        }
      });
      requestAnimationFrame(updateDepth);
    });
  });

  /* =========================
     7. LIGHTBOX
     ========================= */
  var lightbox = $('#lightbox');
  var lightboxImg = $('#lightboxImg');
  var lightboxClose = $('#lightboxClose');
  var lastFocus = null;

  function lightboxIsOpen() { return !!lightbox && !lightbox.hidden && lightbox.classList.contains('active'); }

  function openLightbox(imgEl) {
    if (!lightbox) return;
    lastFocus = doc.activeElement;
    lightboxImg.src = imgEl.src;
    lightboxImg.alt = imgEl.alt;
    lightbox.hidden = false;
    // даём браузеру кадр на применение transition
    // фокус — после .active: до этого диалог visibility:hidden и не фокусируется
    requestAnimationFrame(function () {
      lightbox.classList.add('active');
      lightboxClose.focus();
    });
    doc.body.style.overflow = 'hidden';
    setInert([lightbox], true);
  }
  function closeLightbox() {
    if (!lightboxIsOpen()) return;
    lightbox.classList.remove('active');
    doc.body.style.overflow = '';
    setInert([lightbox], false);
    var done = function () { if (!lightbox.classList.contains('active')) lightbox.hidden = true; };
    reduced.matches ? done() : setTimeout(done, 320);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  $$('.portfolio-open').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openLightbox(btn.querySelector('img'));
    });
  });
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightbox) {
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });
  }
  doc.addEventListener('keydown', function (e) {
    if (lightboxIsOpen()) {
      if (e.key === 'Escape') closeLightbox();
      // в лайтбоксе одна кнопка — Tab держим на ней
      else if (e.key === 'Tab') { e.preventDefault(); lightboxClose.focus(); }
      return;
    }
    if (navIsOpen()) {
      if (e.key === 'Escape') closeNav(true);
      else trapTab(e, header);
    }
  });

  /* =========================
     8. ИНИТ
     ========================= */
  root.classList.remove('no-js');
  requestAnimationFrame(updateDepth);
})();