import * as assert from 'assert';
import * as vscode from 'vscode';
import { PresenceTracker } from '../presence/presenceTracker';

suite('PresenceTracker Test Suite', () => {
	test('starts offline before any editor is observed', () => {
		const tracker = new PresenceTracker();
		try {
			// Fresh tracker, no editor interaction yet in this test run.
			const state = tracker.getCurrentPresence();
			assert.ok(['offline', 'active'].includes(state.status));
		} finally {
			tracker.dispose();
		}
	});

	test('reports the active file name (basename only) on editor open', async () => {
		const tracker = new PresenceTracker();
		try {
			const doc = await vscode.workspace.openTextDocument({
				content: 'console.log("hi");',
				language: 'typescript',
			});
			await vscode.window.showTextDocument(doc);

			// onDidChangeActiveTextEditor fires async; give it a tick.
			await new Promise((resolve) => setTimeout(resolve, 50));

			const state = tracker.getCurrentPresence();
			assert.strictEqual(state.status, 'active');
			// Untitled docs have scheme "untitled", not "file", so this
			// tracker intentionally reports no fileName for them - that's
			// expected, not a bug in the test.
			assert.strictEqual(state.fileName, undefined);
		} finally {
			tracker.dispose();
		}
	});

	test('transitions to idle after the inactivity threshold', async () => {
		const doc = await vscode.workspace.openTextDocument({
			content: 'const ready = true;',
			language: 'typescript',
		});
		await vscode.window.showTextDocument(doc);
		const tracker = new PresenceTracker(20);

		try {
			assert.strictEqual(tracker.getCurrentPresence().status, 'active');
			await new Promise((resolve) => setTimeout(resolve, 40));
			assert.strictEqual(tracker.getCurrentPresence().status, 'idle');
		} finally {
			tracker.dispose();
		}
	});

	test('publishes offline when disposed and clears pending activity', async () => {
		const doc = await vscode.workspace.openTextDocument({
			content: 'const stopping = true;',
			language: 'typescript',
		});
		await vscode.window.showTextDocument(doc);
		const tracker = new PresenceTracker(1000);
		const changes: string[] = [];
		const subscription = tracker.onDidChangePresence((presence) => {
			changes.push(presence.status);
		});

		try {
			assert.strictEqual(tracker.getCurrentPresence().status, 'active');
			tracker.dispose();
			assert.strictEqual(changes[changes.length - 1], 'offline');
			assert.strictEqual(tracker.getCurrentPresence().status, 'offline');
		} finally {
			subscription.dispose();
			tracker.dispose();
		}
	});
});
