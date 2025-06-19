import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';

const ChallengeIntroView = {
    render(container, config, onIntroComplete) {
        if (!container || !config) {
            console.error('ChallengeIntroView: Missing container or config');
            return;
        }

        // Get current game state
        const playerTribe = gameManager.getPlayerTribe();
        const allTribes = gameManager.getTribes();
        const player = gameManager.getPlayerSurvivor();

        // Initialize challenge stage if not set
        this.challengeStage = this.challengeStage || 0;

        switch (this.challengeStage) {
            case 0:
                this.renderJeffIntro(container, config, () => {
                    this.challengeStage++;
                    this.render(container, config, onIntroComplete);
                });
                break;
            case 1:
                this.renderPlayerTribeFlag(container, config, playerTribe, player, () => {
                    this.challengeStage++;
                    this.render(container, config, onIntroComplete);
                });
                break;
            case 2:
                this.renderOtherTribesMessage(container, config, allTribes, () => {
                    this.challengeStage++;
                    this.render(container, config, onIntroComplete);
                });
                break;
            default:
                // Show other tribes (stage 3+)
                const otherTribes = allTribes.filter(tribe => tribe.name !== playerTribe.name);
                const tribeIndex = this.challengeStage - 3;
                if (tribeIndex >= 0 && tribeIndex < otherTribes.length) {
                    this.renderOtherTribeFlag(container, config, otherTribes[tribeIndex], () => {
                        this.challengeStage++;
                        this.render(container, config, onIntroComplete);
                    });
                } else if (this.challengeStage === 3 + otherTribes.length) {
                    // Show Jeff's challenge explanation stage 1
                    this.renderJeffChallengeExplanation(container, config, 1, () => {
                        this.challengeStage++;
                        this.render(container, config, onIntroComplete);
                    });
                } else if (this.challengeStage === 4 + otherTribes.length) {
                    // Show Jeff's challenge explanation stage 2
                    this.renderJeffChallengeExplanation(container, config, 2, () => {
                        this.challengeStage++;
                        this.render(container, config, onIntroComplete);
                    });
                } else if (this.challengeStage === 5 + otherTribes.length) {
                    // Show Jeff's challenge explanation stage 3
                    this.renderJeffChallengeExplanation(container, config, 3, () => {
                        this.challengeStage++;
                        this.render(container, config, onIntroComplete);
                    });
                } else if (this.challengeStage === 6 + otherTribes.length) {
                    // Show First Contact popup
                    this.renderFirstContactPopup(container, config, () => {
                        this.challengeStage++;
                        this.render(container, config, onIntroComplete);
                    });
                } else {
                    // All stages complete, show the actual challenge info
                    onIntroComplete();
                }
                break;
        }
    },

    renderJeffIntro(container, config, onNext) {
        clearChildren(container);

        // Set background
        container.style.backgroundImage = `url('${config.background}')`;
        container.style.backgroundSize = 'cover';
        container.style.backgroundPosition = 'center';
        container.style.backgroundRepeat = 'no-repeat';

        // Parchment wrapper for Jeff's message
        const parchmentWrapper = createElement('div', {
            style: `
                position: absolute;
                top: 30px;
                left: 50%;
                transform: translateX(-50%);
                width: 100%;
                max-width: 320px;
                z-index: 2;
            `
        });

        const parchment = createElement('img', {
            src: 'Assets/parch-landscape.png',
            style: `
                width: 100%;
                max-width: 320px;
                max-height: 180px;
                display: block;
                margin: 0 auto;
            `
        });

        const jeffText = createElement('div', {
            className: 'parchment-text',
            style: `
                color: white;
                font-family: 'Survivant', sans-serif;
                font-weight: bold;
                text-align: center;
                margin: -160px auto 0;
                max-width: 260px;
                font-size: 1.8rem;
                line-height: 1.3;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 120px;
                text-shadow:
                    0 1px 0 #000,
                    0 2px 0 #000,
                    0 3px 0 #000,
                    0 4px 4px rgba(0, 0, 0, 0.5);
            `
        }, config.jeffMessage || 'COME ON IN, GUYS!');

        parchmentWrapper.append(parchment, jeffText);

        // Next button
        const nextButton = createElement('button', {
            style: `
                position: absolute;
                bottom: 40px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 2;
                width: 130px;
                height: 60px;
                background-image: url('Assets/rect-button.png');
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                border: none;
                color: white;
                font-family: 'Survivant', sans-serif;
                font-size: 1.15rem;
                font-weight: bold;
                text-shadow: 1px 1px 2px black;
                padding: 0;
                cursor: pointer;
            `,
            onclick: onNext
        }, 'Next');

        container.append(parchmentWrapper, nextButton);
    },

    renderJeffChallengeExplanation(container, config, stage = 1, onNext) {
        clearChildren(container);

        // Use Jeff background for this explanation
        container.style.backgroundImage = `url('${config.background}')`;

        // Parchment wrapper for Jeff's challenge explanation
        const parchmentWrapper = createElement('div', {
            style: `
                position: absolute;
                top: 30px;
                left: 50%;
                transform: translateX(-50%);
                width: 100%;
                max-width: 320px;
                z-index: 2;
            `
        });

        const parchment = createElement('img', {
            src: 'Assets/parch-landscape.png',
            style: `
                width: 100%;
                max-width: 320px;
                max-height: 180px;
                display: block;
                margin: 0 auto;
            `
        });

        let jeffText, buttonText;

        switch (stage) {
            case 1:
                jeffText = 'Welcome to your first Immunity Challenge of the season! Winning the challenge earns safety for your tribe. Losing tribe will join me tonight for the first Tribal Council of Survivor Island.';
                buttonText = 'Next';
                break;
            case 2:
                jeffText = "Here's how it works: Tribes will compete head to head in a series of stages. Each stage will put each survivor's unique traits to the test.";
                buttonText = 'Next';
                break;
            case 3:
                jeffText = 'First tribes to finish win Immunity.\n\nI\'ll give you a minute to strategize.';
                buttonText = 'Begin Challenge';
                break;
        }

        const textElement = createElement('div', {
            className: 'parchment-text',
            style: `
                color: white;
                font-family: 'Survivant', sans-serif;
                font-weight: bold;
                text-align: center;
                margin: -160px auto 0;
                max-width: 260px;
                font-size: 0.9rem;
                line-height: 1.2;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 120px;
                text-shadow:
                    0 1px 0 #000,
                    0 2px 0 #000,
                    0 3px 0 #000,
                    0 4px 4px rgba(0, 0, 0, 0.5);
                white-space: pre-line;
            `
        }, jeffText);

        parchmentWrapper.append(parchment, textElement);

        // Button
        const actionButton = createElement('button', {
            style: `
                position: absolute;
                bottom: 40px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 2;
                width: 130px;
                height: 60px;
                background-image: url('Assets/rect-button.png');
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                border: none;
                color: white;
                font-family: 'Survivant', sans-serif;
                font-size: 1.15rem;
                font-weight: bold;
                text-shadow: 1px 1px 2px black;
                padding: 0;
                cursor: pointer;
            `,
            onclick: onNext
        }, buttonText);

        container.append(parchmentWrapper, actionButton);
    },

    renderPlayerTribeFlag(container, config, playerTribe, player, onNext) {
        clearChildren(container);

        // Use challenge background instead of Jeff background
        container.style.backgroundImage = `url('Assets/Screens/challenge.png')`;

        const wrapper = createElement('div', {
            className: 'tribe-wrapper',
            style: `
                position: relative;
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            `
        });

        const tribeImage = createElement('img', {
            src: `Assets/Tribe/${playerTribe.color}-portrait.png`,
            alt: `${playerTribe.name} portrait`,
            style: `
                width: 100%;
                max-width: 300px;
                display: block;
                margin: 0 auto;
                position: relative;
                z-index: 1;
            `
        });

        const tribeNameOverlay = createElement('div', {
            style: `
                position: absolute;
                top: 15%;
                left: 50%;
                transform: translateX(-50%);
                color: white;
                text-shadow: 2px 2px 4px black;
                font-size: 2.4rem;
                font-family: 'Survivant', sans-serif;
                z-index: 2;
                pointer-events: none;
            `
        }, playerTribe.name.toUpperCase());

        const memberCount = playerTribe.members.length;
        const isTwoTribeMode = memberCount === 9;
        const topOffset = isTwoTribeMode ? '27%' : '28%';
        const scaleValue = isTwoTribeMode ? 0.9 : 1.05;
        const columns = isTwoTribeMode ? 3 : 2;

        const avatarGrid = createElement('div', {
            style: `
                position: absolute;
                top: ${topOffset};
                left: 50%;
                transform: translate(-50%, 0%) scale(${scaleValue});
                display: grid;
                grid-template-columns: repeat(${columns}, auto);
                grid-template-rows: repeat(3, auto);
                column-gap: 4px;
                row-gap: 8px;
                z-index: 2;
            `
        });

        playerTribe.members.forEach(member => {
            const avatarWrapper = createElement('div', {
                style: 'display: flex; flex-direction: column; align-items: center;'
            });

            const avatar = createElement('img', {
                src: member.avatarUrl || `Assets/Avatars/${member.firstName.toLowerCase()}.jpeg`,
                alt: member.firstName,
                style: `
                    width: 64px;
                    height: 64px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 3px solid ${playerTribe.color};
                    background: #000;
                `
            });

            const name = createElement('span', {
                style: `
                    font-family: 'Survivant', sans-serif;
                    font-size: 0.85rem;
                    color: white;
                    margin-top: 4px;
                    text-align: center;
                    text-shadow: 1px 1px 2px black;
                    width: 80px;
                    white-space: normal;
                    word-break: keep-all;
                    line-height: 1.1;
                `
            }, member.firstName.toUpperCase());

            avatarWrapper.append(avatar, name);
            avatarGrid.appendChild(avatarWrapper);
        });

        const nextButton = createElement('button', {
            style: `
                position: absolute;
                bottom: 40px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 2;
                width: 130px;
                height: 60px;
                background-image: url('Assets/rect-button.png');
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                border: none;
                color: white;
                font-family: 'Survivant', sans-serif;
                font-size: 1.15rem;
                font-weight: bold;
                text-shadow: 1px 1px 2px black;
                padding: 0;
                cursor: pointer;
            `,
            onclick: onNext
        }, 'Next');

        wrapper.append(tribeImage, tribeNameOverlay, avatarGrid, nextButton);
        container.appendChild(wrapper);
    },

    renderOtherTribesMessage(container, config, allTribes, onNext) {
        clearChildren(container);

        // Use challenge background instead of Jeff background
        container.style.backgroundImage = `url('Assets/Screens/challenge.png')`;

        const parchmentWrapper = createElement('div', {
            style: `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 100%;
                max-width: 320px;
                z-index: 2;
            `
        });

        const parchment = createElement('img', {
            src: 'Assets/parch-landscape.png',
            style: `
                width: 100%;
                max-width: 320px;
                max-height: 180px;
                display: block;
                margin: 0 auto;
            `
        });

        const playerTribe = gameManager.getPlayerTribe();
        const otherTribes = allTribes.filter(tribe => tribe.name !== playerTribe.name);
        const messageText = otherTribes.length > 1 ?
            'You see the other tribes walk in from the jungle.' :
            'You see the other tribe walk in from the jungle.';

        const messageTextElement = createElement('div', {
            className: 'parchment-text',
            style: `
                color: white;
                font-family: 'Survivant', sans-serif;
                font-weight: bold;
                text-align: center;
                margin: -140px auto 0;
                max-width: 260px;
                font-size: 1.1rem;
                line-height: 1.3;
                text-shadow:
                    0 1px 0 #000,
                    0 2px 0 #000,
                    0 3px 0 #000,
                    0 4px 4px rgba(0, 0, 0, 0.5);
            `
        }, messageText);

        parchmentWrapper.append(parchment, messageTextElement);

        const nextButton = createElement('button', {
            style: `
                position: absolute;
                bottom: 40px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 2;
                width: 130px;
                height: 60px;
                background-image: url('Assets/rect-button.png');
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                border: none;
                color: white;
                font-family: 'Survivant', sans-serif;
                font-size: 1.15rem;
                font-weight: bold;
                text-shadow: 1px 1px 2px black;
                padding: 0;
                cursor: pointer;
            `,
            onclick: onNext
        }, 'Next');

        container.append(parchmentWrapper, nextButton);
    },

    renderOtherTribeFlag(container, config, tribe, onNext) {
        clearChildren(container);

        // Use challenge background instead of Jeff background
        container.style.backgroundImage = `url('Assets/Screens/challenge.png')`;

        const wrapper = createElement('div', {
            className: 'tribe-wrapper',
            style: `
                position: relative;
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            `
        });

        const tribeImage = createElement('img', {
            src: `Assets/Tribe/${tribe.color}-portrait.png`,
            alt: `${tribe.name} portrait`,
            style: `
                width: 100%;
                max-width: 300px;
                display: block;
                margin: 0 auto;
                position: relative;
                z-index: 1;
            `
        });

        const tribeNameOverlay = createElement('div', {
            style: `
                position: absolute;
                top: 15%;
                left: 50%;
                transform: translateX(-50%);
                color: white;
                text-shadow: 2px 2px 4px black;
                font-size: 2.4rem;
                font-family: 'Survivant', sans-serif;
                z-index: 2;
                pointer-events: none;
            `
        }, tribe.name.toUpperCase());

        const memberCount = tribe.members.length;
        const isTwoTribeMode = memberCount === 9;
        const topOffset = isTwoTribeMode ? '27%' : '28%';
        const scaleValue = isTwoTribeMode ? 0.9 : 1.05;
        const columns = isTwoTribeMode ? 3 : 2;

        const avatarGrid = createElement('div', {
            style: `
                position: absolute;
                top: ${topOffset};
                left: 50%;
                transform: translate(-50%, 0%) scale(${scaleValue});
                display: grid;
                grid-template-columns: repeat(${columns}, auto);
                grid-template-rows: repeat(3, auto);
                column-gap: 4px;
                row-gap: 8px;
                z-index: 2;
            `
        });

        tribe.members.forEach(member => {
            const avatarWrapper = createElement('div', {
                style: 'display: flex; flex-direction: column; align-items: center;'
            });

            const avatar = createElement('img', {
                src: member.avatarUrl || `Assets/Avatars/${member.firstName.toLowerCase()}.jpeg`,
                alt: member.firstName,
                style: `
                    width: 64px;
                    height: 64px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 3px solid ${tribe.color};
                    background: #000;
                `
            });

            const name = createElement('span', {
                style: `
                    font-family: 'Survivant', sans-serif;
                    font-size: 0.85rem;
                    color: white;
                    margin-top: 4px;
                    text-align: center;
                    text-shadow: 1px 1px 2px black;
                    width: 80px;
                    white-space: normal;
                    word-break: keep-all;
                    line-height: 1.1;
                `
            }, member.firstName.toUpperCase());

            avatarWrapper.append(avatar, name);
            avatarGrid.appendChild(avatarWrapper);
        });

        const nextButton = createElement('button', {
            style: `
                position: absolute;
                bottom: 40px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 2;
                width: 130px;
                height: 60px;
                background-image: url('Assets/rect-button.png');
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                border: none;
                color: white;
                font-family: 'Survivant', sans-serif;
                font-size: 1.15rem;
                font-weight: bold;
                text-shadow: 1px 1px 2px black;
                padding: 0;
                cursor: pointer;
            `,
            onclick: onNext
        }, 'Next');

        wrapper.append(tribeImage, tribeNameOverlay, avatarGrid, nextButton);
        container.appendChild(wrapper);
    },

    renderFirstContactPopup(container, config, onNext) {
        clearChildren(container);

        // Use Jeff background for this explanation
        container.style.backgroundImage = `url('${config.background}')`;

        // Large sideways popup wrapper
        const popupWrapper = createElement('div', {
            style: `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(90deg);
                width: 80vh;
                height: 80vw;
                max-width: 600px;
                max-height: 400px;
                z-index: 2;
                background-image: url('Assets/rect-button-1.png');
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                display: flex;
                align-items: center;
                justify-content: center;
            `
        });

        const popupText = createElement('div', {
            style: `
                color: white;
                font-family: 'Survivant', sans-serif;
                font-weight: bold;
                text-align: center;
                font-size: 2rem;
                line-height: 1.3;
                text-shadow:
                    0 2px 0 #000,
                    0 4px 0 #000,
                    0 6px 0 #000,
                    0 8px 8px rgba(0, 0, 0, 0.5);
                transform: rotate(-90deg);
                width: 300px;
                height: 200px;
                display: flex;
                align-items: center;
                justify-content: center;
            `
        }, 'FIRST CONTACT');

        popupWrapper.appendChild(popupText);

        const nextButton = createElement('button', {
            style: `
                position: absolute;
                bottom: 40px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 2;
                width: 130px;
                height: 60px;
                background-image: url('Assets/rect-button.png');
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                border: none;
                color: white;
                font-family: 'Survivant', sans-serif;
                font-size: 1.15rem;
                font-weight: bold;
                text-shadow: 1px 1px 2px black;
                padding: 0;
                cursor: pointer;
            `,
            onclick: onNext
        }, 'Continue');

        container.append(popupWrapper, nextButton);
    }
};

export default ChallengeIntroView;