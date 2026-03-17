import WindowManager from './WindowManager.js'



const t = THREE;
let camera, scene, renderer, world;
let near, far;
let pixR = window.devicePixelRatio ? window.devicePixelRatio : 1;
let heart = null;
let particles = null;
let particleMaterial = null;
let sceneOffsetTarget = {x: 0, y: 0};
let sceneOffset = {x: 0, y: 0};

let today = new Date();
today.setHours(0);
today.setMinutes(0);
today.setSeconds(0);
today.setMilliseconds(0);
today = today.getTime();

let internalTime = getTime();
let windowManager;
let initialized = false;

// get time in seconds since beginning of the day (so that all windows use the same time)
function getTime ()
{
	return (new Date().getTime() - today) / 1000.0;
}


if (new URLSearchParams(window.location.search).get("clear"))
{
	localStorage.clear();
}
else
{	
	// this code is essential to circumvent that some browsers preload the content of some pages before you actually hit the url
	document.addEventListener("visibilitychange", () => 
	{
		if (document.visibilityState != 'hidden' && !initialized)
		{
			init();
		}
	});

	window.onload = () => {
		if (document.visibilityState != 'hidden')
		{
			init();
		}
	};

	function init ()
	{
		initialized = true;

		// add a short timeout because window.offsetX reports wrong values before a short period 
		setTimeout(() => {
			setupScene();
			setupWindowManager();
			resize();
			updateWindowShape(false);
			render();
			window.addEventListener('resize', resize);
		}, 500)	
	}

	function setupScene ()
	{
		camera = new t.OrthographicCamera(0, 0, window.innerWidth, window.innerHeight, -10000, 10000);
		
		camera.position.z = 2.5;
		near = camera.position.z - .5;
		far = camera.position.z + 0.5;

		scene = new t.Scene();
		scene.background = new t.Color(0.0);
		scene.add( camera );

		renderer = new t.WebGLRenderer({antialias: true, depthBuffer: true});
		renderer.setPixelRatio(pixR);
	    
	  	world = new t.Object3D();
		scene.add(world);

		renderer.domElement.setAttribute("id", "scene");
		document.body.appendChild( renderer.domElement );
	}

	function setupWindowManager ()
	{
		windowManager = new WindowManager();
		windowManager.setWinShapeChangeCallback(updateWindowShape);
		windowManager.setWinChangeCallback(windowsUpdated);

		// here you can add your custom metadata to each windows instance
		let metaData = {foo: "bar"};

		// this will init the windowmanager and add this window to the centralised pool of windows
		windowManager.init(metaData);

		// call update windows initially (it will later be called by the win change callback)
		windowsUpdated();
	}

	function windowsUpdated ()
	{
		createSparklingHeart();
	}

	// Parametric heart curve: t in [0, 2*PI] (y negated for correct orientation)
	function getHeartPoint(t, scale) {
		let x = 16 * Math.pow(Math.sin(t), 3);
		let y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
		return { x: x * scale, y: -y * scale };
	}

	function createSparklingHeart ()
	{
		// Remove existing heart and particles
		if (heart) {
			world.remove(heart);
		}
		if (particles) {
			world.remove(particles);
		}

		let centerX = window.innerWidth / 2;
		let centerY = window.innerHeight / 2;
		let heartScale = 3.5;
		let particleCount = 3000;

		// Create base heart outline (wireframe)
		let heartShape = new t.Shape();
		let curvePoints = [];
		for (let i = 0; i <= 100; i++) {
			let pt = getHeartPoint((i / 100) * Math.PI * 2, heartScale);
			curvePoints.push(new t.Vector2(pt.x, pt.y));
		}
		heartShape.moveTo(curvePoints[0].x, curvePoints[0].y);
		for (let i = 1; i < curvePoints.length; i++) {
			heartShape.lineTo(curvePoints[i].x, curvePoints[i].y);
		}
		heartShape.closePath();
		let heartGeometry = new t.ShapeGeometry(heartShape);
		let heartMat = new t.MeshBasicMaterial({
			color: 0xff6b8a,
			transparent: true,
			opacity: 0.2,
			wireframe: true
		});
		heart = new t.Mesh(heartGeometry, heartMat);
		heart.position.set(centerX, centerY, 0);
		world.add(heart);

		// Particles: uniform distribution on heart surface (like sphere)
		let positions = new Float32Array(particleCount * 3);
		let phases = new Float32Array(particleCount);
		let sizes = new Float32Array(particleCount);

		for (let i = 0; i < particleCount; i++) {
			let t_val = Math.random() * Math.PI * 2;
			let scale = 0.7 + Math.random() * 0.6; // Variation like sphere
			let pt = getHeartPoint(t_val, heartScale * scale);
			let zOffset = (Math.random() - 0.5) * 20;
			positions[i * 3] = pt.x;
			positions[i * 3 + 1] = pt.y;
			positions[i * 3 + 2] = zOffset;
			phases[i] = Math.random() * Math.PI * 2;
			sizes[i] = 1 + Math.random() * 2;
		}

		let posArray = positions;
		let phaseArray = phases;
		let sizeArray = sizes;

		let particleGeometry = new t.BufferGeometry();
		particleGeometry.setAttribute('position', new t.BufferAttribute(posArray, 3));
		particleGeometry.setAttribute('phase', new t.BufferAttribute(phaseArray, 1));
		particleGeometry.setAttribute('size', new t.BufferAttribute(sizeArray, 1));

		// Custom shader for sparkling effect
		particleMaterial = new t.ShaderMaterial({
			uniforms: {
				time: { value: 0 }
			},
			vertexShader: `
				attribute float phase;
				attribute float size;
				uniform float time;
				varying float vAlpha;
				void main() {
					vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
					gl_Position = projectionMatrix * mvPosition;
					float sparkle = sin(time * 3.0 + phase) * 0.5 + 0.5;
					vAlpha = sparkle * sparkle;
					gl_PointSize = size * (0.5 + sparkle) * 2.0;
				}
			`,
			fragmentShader: `
				varying float vAlpha;
				void main() {
					float dist = length(gl_PointCoord - 0.5);
					float alpha = (1.0 - smoothstep(0.0, 0.5, dist)) * vAlpha;
					gl_FragColor = vec4(1.0, 0.95, 1.0, alpha);
				}
			`,
			transparent: true,
			depthWrite: false,
			blending: t.AdditiveBlending
		});

		particles = new t.Points(particleGeometry, particleMaterial);
		particles.position.set(centerX, centerY, 0);
		world.add(particles);
	}

	function updateWindowShape (easing = true)
	{
		// storing the actual offset in a proxy that we update against in the render function
		sceneOffsetTarget = {x: -window.screenX, y: -window.screenY};
		if (!easing) sceneOffset = sceneOffsetTarget;
	}


	function render ()
	{
		let t = getTime();

		windowManager.update();


		// calculate the new position based on the delta between current offset and new offset times a falloff value (to create the nice smoothing effect)
		let falloff = .05;
		sceneOffset.x = sceneOffset.x + ((sceneOffsetTarget.x - sceneOffset.x) * falloff);
		sceneOffset.y = sceneOffset.y + ((sceneOffsetTarget.y - sceneOffset.y) * falloff);

		// set the world position to the offset
		world.position.x = sceneOffset.x;
		world.position.y = sceneOffset.y;

		// Update heart and particles - center of screen with beating effect
		let centerX = window.innerWidth / 2;
		let centerY = window.innerHeight / 2;

		// Beating: scale oscillates (phóng to - thu nhỏ)
		let beatSpeed = 1.2;
		let beatScale = 1 + 0.08 * Math.sin(t * beatSpeed * Math.PI);

		if (heart) {
			heart.position.set(centerX, centerY, 0);
			heart.scale.set(beatScale, beatScale, 1);
		}
		if (particles && particleMaterial) {
			particles.position.set(centerX, centerY, 0);
			particles.scale.set(beatScale, beatScale, 1);
			particleMaterial.uniforms.time.value = t;
		}

		renderer.render(scene, camera);
		requestAnimationFrame(render);
	}


	// resize the renderer to fit the window size
	function resize ()
	{
		let width = window.innerWidth;
		let height = window.innerHeight
		
		camera = new t.OrthographicCamera(0, width, 0, height, -10000, 10000);
		camera.updateProjectionMatrix();
		renderer.setSize( width, height );
	}
}