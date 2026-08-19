import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import {
	parseCreateWorkflowHref,
	readCreateEditorMode,
} from '../public/shared/createWorkflow.js';
import {
	feedItemToCreationDetailSeed,
	seedToMutateCreation,
} from '../public/shared/creationDetailSeed.js';

describe('parseCreateWorkflowHref', () => {
	beforeEach(() => {
		global.window = {
			location: { origin: 'https://example.test', pathname: '/', search: '', hash: '' },
		};
		global.document = { cookie: '' };
	});

	afterEach(() => {
		delete global.window;
		delete global.document;
	});

	test('parses /create as advanced by default', () => {
		expect(parseCreateWorkflowHref('/create')).toEqual({
			mode: 'create',
			editor: 'advanced',
			href: '/create',
		});
	});

	test('parses /create as basic when create_editor=simple cookie is set', () => {
		document.cookie = 'create_editor=simple';
		expect(readCreateEditorMode()).toBe('basic');
		expect(parseCreateWorkflowHref('/create?foo=1')).toEqual({
			mode: 'create',
			editor: 'basic',
			href: '/create?foo=1',
		});
	});

	test('parses mutate URLs', () => {
		expect(parseCreateWorkflowHref('/creations/42/mutate')).toEqual({
			mode: 'mutate',
			creationId: 42,
			href: '/creations/42/mutate',
		});
		expect(parseCreateWorkflowHref('/creations/7/edit?source_id=3')).toEqual({
			mode: 'mutate',
			creationId: 7,
			href: '/creations/7/edit?source_id=3',
		});
	});

	test('returns null for unrelated paths', () => {
		expect(parseCreateWorkflowHref('/party')).toBeNull();
		expect(parseCreateWorkflowHref('/creations/42')).toBeNull();
		expect(parseCreateWorkflowHref('/creations/abc/mutate')).toBeNull();
		expect(parseCreateWorkflowHref('')).toBeNull();
	});
});

describe('seedToMutateCreation', () => {
	test('maps detail seed url and status for mutate paint', () => {
		const creation = seedToMutateCreation({
			id: 42,
			image_url: 'https://example.test/img.png',
			status: 'completed',
			title: 'Hi',
			user_id: 7,
		});
		expect(creation).toMatchObject({
			id: 42,
			url: 'https://example.test/img.png',
			status: 'completed',
			title: 'Hi',
		});
	});

	test('refuses group mutate seed without matching source id', () => {
		expect(seedToMutateCreation({ id: 1, image_url: 'x' }, { sourceId: 9 })).toBeNull();
	});

	test('uses tagged group source image when source id matches', () => {
		const creation = seedToMutateCreation(
			{
				id: 10,
				image_url: 'https://example.test/cover.png',
				mutate_source_id: 9,
				mutate_image_url: 'https://example.test/source.png',
				status: 'completed',
			},
			{ sourceId: 9 }
		);
		expect(creation).toMatchObject({
			id: 9,
			url: 'https://example.test/source.png',
			group_id: 10,
		});
	});

	test('keeps the API image url from a feed card seed', () => {
		const seed = feedItemToCreationDetailSeed({
			id: 3,
			url: 'https://example.test/full.png',
			thumbnail_url: '/thumb.png',
			status: 'completed',
		});
		expect(seed.image_url).toBe('https://example.test/full.png');
	});
});
