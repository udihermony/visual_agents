import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LMStudioClient } from "./lmstudio-wrapper.js";

class AgentVisualization {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.agentBoxes = [];
        this.arrows = [];
        this.boxSpacing = 4;
        this.conversationHistory = [];
        this.selectedBox = null;
        
        // Mouse interaction variables
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.draggedObject = null;
        this.offset = new THREE.Vector3();
        this.plane = new THREE.Plane();
        this.intersection = new THREE.Vector3();
        
        // Add orbit controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true; // Add smooth damping effect
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = true; // Allow panning in screen space
        this.controls.minDistance = 5; // Minimum zoom distance
        this.controls.maxDistance = 50; // Maximum zoom distance
        this.controls.maxPolarAngle = Math.PI / 2; // Prevent going below ground
        this.controls.enablePan = true; // Enable panning
        this.controls.enableZoom = true; // Enable zooming
        this.controls.enableRotate = true; // Enable rotation
        
        this.init();
    }

    // Helper function to draw rounded rectangles
    roundRect(ctx, x, y, width, height, radius, fill, stroke) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        if (fill) {
            ctx.fill();
        }
        if (stroke) {
            ctx.stroke();
        }
    }

    init() {
        // Setup renderer with better quality
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);

        // Setup camera
        this.camera.position.z = 15;
        this.camera.position.y = 5;
        this.camera.lookAt(0, 0, 0);

        // Add ambient light for better overall illumination
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambientLight);

        // Add hemisphere light
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
        hemiLight.position.set(0, 20, 0);
        this.scene.add(hemiLight);

        // Add directional light with shadows
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
        dirLight.position.set(-3, 10, -10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 50;
        dirLight.shadow.camera.left = -20;
        dirLight.shadow.camera.right = 20;
        dirLight.shadow.camera.top = 20;
        dirLight.shadow.camera.bottom = -20;
        this.scene.add(dirLight);

        // Add a subtle ground plane
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.8,
            metalness: 0.2,
            transparent: true,
            opacity: 0.5,
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Setup event listeners
        window.addEventListener('resize', () => this.onWindowResize());
        document.getElementById('submit-prompt').addEventListener('click', () => this.handlePrompt());
        document.getElementById('prompt-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handlePrompt();
            }
        });

        // Mouse interaction events
        this.renderer.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.renderer.domElement.addEventListener('mouseup', () => this.onMouseUp());
        this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));

        // Initialize object input modal
        this.initObjectInputModal();

        // Start animation loop
        this.animate();
    }

    onMouseDown(event) {
        event.preventDefault();
        
        // Calculate mouse position in normalized device coordinates
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Update the picking ray with the camera and mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Find intersections with boxes
        const intersects = this.raycaster.intersectObjects(this.agentBoxes.map(box => box.box));

        if (intersects.length > 0) {
            this.draggedObject = intersects[0].object;
            
            // Calculate offset
            this.plane.setFromNormalAndCoplanarPoint(
                this.camera.getWorldDirection(this.plane.normal),
                this.draggedObject.position
            );
            
            this.raycaster.ray.intersectPlane(this.plane, this.intersection);
            this.offset.copy(this.intersection).sub(this.draggedObject.position);
        }
    }

    onMouseMove(event) {
        event.preventDefault();
        
        if (this.draggedObject) {
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            this.raycaster.ray.intersectPlane(this.plane, this.intersection);
            
            // Update box position
            this.draggedObject.position.copy(this.intersection.sub(this.offset));
            
            // Update associated sprites
            const boxIndex = this.agentBoxes.findIndex(box => box.box === this.draggedObject);
            if (boxIndex !== -1) {
                const { labelSprite, contentSprite } = this.agentBoxes[boxIndex];
                labelSprite.position.copy(this.draggedObject.position).add(new THREE.Vector3(0, 1.5, 0.51));
                contentSprite.position.copy(this.draggedObject.position).add(new THREE.Vector3(0, 0, 0.51));
            }
            
            // Update arrows
            this.updateArrows();
        }
    }

    onMouseUp() {
        this.draggedObject = null;
    }

    updateArrows() {
        // Remove old arrows
        this.arrows.forEach(({ arrow, head }) => {
            this.scene.remove(arrow);
            this.scene.remove(head);
        });
        this.arrows = [];

        // Create new arrows
        for (let i = 1; i < this.agentBoxes.length; i++) {
            this.createArrow(i - 1, i);
        }
    }

    addMessageToUI(role, content) {
        const conversationContainer = document.getElementById('conversation-container');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        messageDiv.textContent = content;
        conversationContainer.appendChild(messageDiv);
        conversationContainer.scrollTop = conversationContainer.scrollHeight;
    }

    createTextCanvas(text, label = "", width = 256, height = 160) {
        const canvas = document.createElement("canvas")
        const context = canvas.getContext("2d")
        canvas.width = width
        canvas.height = height

        // Set background with rounded corners
        context.fillStyle = "rgba(30, 30, 40, 0.85)"
        this.roundRect(context, 0, 0, width, height, 10, true, false)

        // Add border
        context.strokeStyle = "rgba(100, 100, 255, 0.5)"
        context.lineWidth = 2
        this.roundRect(context, 0, 0, width, height, 10, false, true)

        // Draw label at the top
        if (label) {
            context.fillStyle = "#4a6bff"
            context.font = "bold 16px Arial"
            context.fillText(label, 10, 25)
            
            // Add separator line
            context.beginPath()
            context.strokeStyle = "rgba(100, 100, 255, 0.3)"
            context.moveTo(10, 35)
            context.lineTo(width - 10, 35)
            context.stroke()
        }

        // Set text style for content
        context.fillStyle = "#ffffff"
        context.font = "16px Arial"

        // Word wrap the text
        const words = text.split(" ")
        let line = ""
        let y = label ? 55 : 20 // Start content below label if present
        const lineHeight = 20
        const maxWidth = width - 20

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + " "
            const metrics = context.measureText(testLine)
            const testWidth = metrics.width

            if (testWidth > maxWidth && n > 0) {
                context.fillText(line, 10, y)
                line = words[n] + " "
                y += lineHeight

                // Check if we've run out of vertical space
                if (y > height - lineHeight) {
                    context.fillText(line + "...", 10, y)
                    break
                }
            } else {
                line = testLine
            }
        }

        // Add the last line
        if (y <= height - lineHeight) {
            context.fillText(line, 10, y)
        }

        return canvas
    }

    createAgentBox(index, label, content) {
        // Create a group for the text elements
        const textGroup = new THREE.Group()
        
        // Create single sprite with both label and content
        const contentCanvas = this.createTextCanvas(content, label)
        const contentTexture = new THREE.CanvasTexture(contentCanvas)
        const contentMaterial = new THREE.SpriteMaterial({
            map: contentTexture,
            transparent: true,
        })
        const contentSprite = new THREE.Sprite(contentMaterial)
        contentSprite.position.set(0, 0, 0)
        contentSprite.scale.set(2, 1.25, 1) // Adjusted height to accommodate label
        
        // Add sprite to group
        textGroup.add(contentSprite)
        
        // Position the group
        textGroup.position.x = index * this.boxSpacing
        textGroup.position.y = 0
        
        this.scene.add(textGroup)
        
        this.agentBoxes.push({
            box: textGroup,
            contentSprite,
            label,
            content,
            isHighlighted: false
        })
        
        // Create arrow if this isn't the first box
        if (index > 0) {
            this.createArrow(index - 1, index)
        }
        
        return textGroup
    }

    createArrow(fromIndex, toIndex) {
        const fromBox = this.agentBoxes[fromIndex].box;
        const toBox = this.agentBoxes[toIndex].box;

        const start = new THREE.Vector3(fromBox.position.x + 1, fromBox.position.y, fromBox.position.z);
        const end = new THREE.Vector3(toBox.position.x - 1, toBox.position.y, toBox.position.z);

        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        direction.normalize();

        const arrowGeometry = new THREE.CylinderGeometry(0.05, 0.05, length, 8);
        const arrowMaterial = new THREE.MeshPhongMaterial({ color: 0x666666 });
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);

        arrow.position.copy(start).add(direction.multiplyScalar(length / 2));
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

        const headGeometry = new THREE.ConeGeometry(0.1, 0.2, 8);
        const head = new THREE.Mesh(headGeometry, arrowMaterial);
        head.position.copy(end);
        head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

        this.scene.add(arrow);
        this.scene.add(head);
        this.arrows.push({ arrow, head });
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update controls
        this.controls.update();
        
        // Add subtle floating animation to text boxes
        this.agentBoxes.forEach((boxData, index) => {
            const time = Date.now() * 0.001;
            boxData.box.position.y = Math.sin(time + index) * 0.1;
        });
        
        this.renderer.render(this.scene, this.camera);
    }

    async handlePrompt() {
        const promptInput = document.getElementById('prompt-input');
        const prompt = promptInput.value.trim();
        
        if (!prompt) return;

        // Add user message to UI
        this.addMessageToUI('user', prompt);

        // Create box for the user's prompt
        this.createAgentBox(this.agentBoxes.length, "User Input", prompt);

        // Initialize LM Studio client
        const client = new LMStudioClient({
            baseUrl: 'http://192.168.1.132:1234',
            headers: {
                'Authorization': 'Bearer sk-1234567890'  // LM Studio default API key
            }
        });

        try {
            const model = await client.llm.model();
            const response = await model.respond([
                { role: 'user', content: prompt }
            ]);

            // Add agent response to UI
            this.addMessageToUI('agent', response);

            // Create box for the agent's response
            this.createAgentBox(this.agentBoxes.length, "Agent Response", response);
            
            // Clear the input
            promptInput.value = '';
        } catch (error) {
            console.error('Error getting response:', error);
            const errorMessage = "Failed to get response from agent";
            this.addMessageToUI('agent', errorMessage);
            this.createAgentBox(this.agentBoxes.length, "Error", errorMessage);
        }
    }

    highlightBox(boxData) {
        // Clear previous highlights
        this.clearAllHighlights();
        
        // Highlight the selected text box
        boxData.contentSprite.material.opacity = 1;
        boxData.isHighlighted = true;
    }

    clearAllHighlights() {
        this.agentBoxes.forEach((boxData) => {
            if (boxData.isHighlighted) {
                boxData.contentSprite.material.opacity = 0.9;
                boxData.isHighlighted = false;
            }
        });
    }

    initObjectInputModal() {
        // Create modal elements if they don't exist
        if (!document.getElementById("object-input-modal")) {
            const modal = document.createElement("div");
            modal.id = "object-input-modal";
            modal.className = "modal";

            modal.innerHTML = `
                <div class="modal-content">
                    <span class="close-button">&times;</span>
                    <h3 id="modal-title">Edit Node</h3>
                    <div id="input-sources" class="input-sources"></div>
                    <textarea id="object-input" placeholder="Enter your text..."></textarea>
                    <button id="submit-object-input">Submit</button>
                </div>
            `;

            document.body.appendChild(modal);

            // Add event listeners for modal
            document.querySelector(".close-button").addEventListener("click", () => {
                modal.style.display = "none";
            });

            document.getElementById("submit-object-input").addEventListener("click", () => {
                this.handleObjectInput();
            });

            // Close modal when clicking outside
            window.addEventListener("click", (e) => {
                if (e.target === modal) {
                    modal.style.display = "none";
                }
            });
        }
    }
}

// Initialize the visualization
new AgentVisualization(); 