import gameManager from '../core/GameManager.js';

export default class GameOverScreen {
  setup(data = {}) {
    const container = document.getElementById('game-over-screen');
    if (!container) return;
    const player = gameManager.player || {};
    const placement = data.placement || player.placement || (gameManager.survivors || []).filter(s => !s.isOut).length + 1;
    const jury = gameManager.jury || [];
    container.innerHTML = `
      <div class="game-over-card" role="dialog" aria-labelledby="game-over-title">
        <h1 id="game-over-title">Your Survivor Island Story</h1>
        <p class="game-over-result"><strong>${player.name || 'Player'}</strong>, your game is over.</p>
        <p>Day ${gameManager.day || '—'} · Placement ${placement || '—'}</p>
        <p>${jury.some(member => member.id === player.id) ? 'You made the jury.' : 'You did not make the jury.'}</p>
        <button type="button" class="primary-button" data-game-over-restart>Return to Title</button>
      </div>`;
    container.querySelector('[data-game-over-restart]')?.addEventListener('click', () => {
      gameManager.resetGameState();
      gameManager.setGameState('welcome');
    });
  }

  teardown() {
    const container = document.getElementById('game-over-screen');
    if (container) container.innerHTML = '';
  }
}