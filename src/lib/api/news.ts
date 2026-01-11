/**
 * News API - Fetch news from GDELT and other sources
 */

import { ServiceClient } from '$lib/services/client';
import { FEEDS } from '$lib/config/feeds';
import type { NewsItem, NewsCategory } from '$lib/types';
import { containsAlertKeyword, detectRegion, detectTopics } from '$lib/config/keywords';

const client = new ServiceClient({ debug: false });

interface GdeltArticle {
	title: string;
	url: string;
	seendate: string;
	domain: string;
	socialimage?: string;
}

interface GdeltResponse {
	articles?: GdeltArticle[];
}

/**
 * Transform GDELT article to NewsItem
 */
function transformGdeltArticle(
	article: GdeltArticle,
	category: NewsCategory,
	source: string
): NewsItem {
	const title = article.title || '';
	const alert = containsAlertKeyword(title);

	return {
		id: `gdelt-${article.url?.slice(-20) || Math.random().toString(36)}`,
		title,
		link: article.url,
		pubDate: article.seendate,
		timestamp: article.seendate ? new Date(article.seendate).getTime() : Date.now(),
		source: source || article.domain || 'Unknown',
		category,
		isAlert: !!alert,
		alertKeyword: alert?.keyword || undefined,
		region: detectRegion(title) ?? undefined,
		topics: detectTopics(title)
	};
}

/**
 * Fetch news for a specific category using GDELT
 */
export async function fetchCategoryNews(category: NewsCategory): Promise<NewsItem[]> {
	// Build query from category keywords
	const categoryQueries: Record<NewsCategory, string> = {
		politics: 'politics OR government OR election OR congress',
		tech: 'technology OR software OR startup OR silicon valley',
		finance: 'finance OR stock market OR economy OR banking',
		gov: 'federal government OR white house OR congress OR regulation',
		ai: 'artificial intelligence OR machine learning OR AI OR ChatGPT',
		intel: 'intelligence OR security OR military OR defense'
	};

	try {
		const query = encodeURIComponent(categoryQueries[category]);
		const result = await client.request<GdeltResponse>(
			'GDELT',
			`/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=20&format=json&sort=date`
		);

		if (!result.data?.articles) return [];

		// Get source names for this category
		const categoryFeeds = FEEDS[category] || [];
		const defaultSource = categoryFeeds[0]?.name || 'News';

		return result.data.articles.map((article) =>
			transformGdeltArticle(article, category, article.domain || defaultSource)
		);
	} catch (error) {
		console.error(`[News API] Error fetching ${category}:`, error);
		return [];
	}
}

/**
 * Fetch all news
 */
export async function fetchAllNews(): Promise<Record<NewsCategory, NewsItem[]>> {
	const categories: NewsCategory[] = ['politics', 'tech', 'finance', 'gov', 'ai', 'intel'];
	const results = await Promise.all(
		categories.map(async (category) => ({
			category,
			items: await fetchCategoryNews(category)
		}))
	);

	return results.reduce(
		(acc, { category, items }) => {
			acc[category] = items;
			return acc;
		},
		{} as Record<NewsCategory, NewsItem[]>
	);
}
