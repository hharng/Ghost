import GlobalDataProvider from '../../../src/providers/PostAnalyticsContext';
import React from 'react';
import {HttpResponse, http} from 'msw';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {renderHook, waitFor} from '@testing-library/react';
import {setupServer} from 'msw/node';
import {usePostNewsletterStats} from '../../../src/hooks/usePostNewsletterStats';

const server = setupServer();

const createTestQueryClient = () => new QueryClient({
    defaultOptions: {
        queries: {
            retry: false
        }
    }
});

describe('usePostNewsletterStats', () => {
    beforeAll(() => server.listen());
    afterEach(() => {
        server.resetHandlers();
        vi.resetAllMocks();
    });
    afterAll(() => server.close());

    const wrapper = ({children}: {children: React.ReactNode}) => {
        const queryClient = createTestQueryClient();
        return (
            <QueryClientProvider client={queryClient}>
                <GlobalDataProvider>{children}</GlobalDataProvider>
            </QueryClientProvider>
        );
    };

    it('returns empty stats when post is not loaded', async () => {
        server.use(
            http.get('/ghost/api/admin/posts/:id/', () => {
                return HttpResponse.json({posts: []});
            }),
            http.get('/ghost/api/admin/stats/newsletter-stats/', () => {
                return HttpResponse.json({stats: []});
            }),
            http.get('/ghost/api/admin/links/', () => {
                return HttpResponse.json({links: []});
            })
        );

        const {result} = renderHook(() => usePostNewsletterStats('post-id'), {wrapper});

        // Initial state should be loading
        expect(result.current.isLoading).toBe(true);

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.post).toBeUndefined();
        expect(result.current.stats).toEqual({
            sent: 0,
            opened: 0,
            clicked: 0,
            openedRate: 0,
            clickedRate: 0
        });

        expect(result.current.averageStats).toEqual({
            openedRate: 0,
            clickedRate: 0
        });
        expect(result.current.topLinks).toEqual([]);
    });

    it('calculates stats correctly from post data', async () => {
        let linksRequestUrl: URL | undefined;

        server.use(
            http.get('/ghost/api/admin/posts/:id/', () => {
                return HttpResponse.json({
                    posts: [{
                        id: 'post-id',
                        email: {
                            email_count: 1000,
                            opened_count: 500
                        },
                        count: {
                            clicks: 200
                        }
                    }],
                    meta: {}
                });
            }),
            http.get('/ghost/api/admin/stats/newsletter-stats/', () => {
                return HttpResponse.json({
                    stats: [
                        {
                            open_rate: 0.5,
                            click_rate: 0.2
                        },
                        {
                            open_rate: 0.6,
                            click_rate: 0.4
                        }
                    ],
                    meta: {}
                });
            }),
            http.get('/ghost/api/admin/links/', ({request}) => {
                linksRequestUrl = new URL(request.url);
                return HttpResponse.json({
                    links: [{
                        post_id: 'post-id',
                        link: {
                            link_id: 'link-1',
                            from: 'https://example.com/from',
                            to: 'https://example.com/to?ref=test&attribution_id=test&attribution_type=test',
                            edited: false
                        },
                        count: {
                            clicks: 10
                        }
                    }, {
                        post_id: 'post-id',
                        link: {
                            link_id: 'link-2',
                            from: 'https://example.com/from',
                            to: 'https://google.com/?ref=test&attribution_id=test&attribution_type=test',
                            edited: false
                        },
                        count: {
                            clicks: 20
                        }
                    }],
                    meta: {}
                });
            })
        );
        const {result} = renderHook(() => usePostNewsletterStats('post-id'), {wrapper});

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.stats).toEqual({
            sent: 1000,
            opened: 500,
            clicked: 200,
            openedRate: 0.5,
            clickedRate: 0.2
        });

        expect(result.current.averageStats).toEqual({
            openedRate: 0.55,
            clickedRate: 0.3
        });

        expect(result.current.topLinks).toEqual([{
            count: 20,
            link: {
                link_id: 'link-2',
                from: 'https://example.com/from',
                originalTo: 'https://google.com/?ref=test&attribution_id=test&attribution_type=test',
                title: 'google.com',
                to: 'https://google.com/',
                edited: false
            }
        }, {
            count: 10,
            link: {
                link_id: 'link-1',
                from: 'https://example.com/from',
                originalTo: 'https://example.com/to?ref=test&attribution_id=test&attribution_type=test',
                title: 'example.com/to',
                to: 'https://example.com/to',
                edited: false
            }
        }]);

        expect(linksRequestUrl?.searchParams.get('filter')).toBe('post_id:\'post-id\'');
        expect(linksRequestUrl?.searchParams.get('limit')).toBe('5');
    });

    it('handles missing email data', async () => {
        server.use(
            http.get('/ghost/api/admin/posts/:id/', () => {
                return HttpResponse.json({
                    posts: [{
                        id: 'post-id',
                        count: {
                            clicks: 200
                        }
                    }]
                });
            }),
            http.get('/ghost/api/admin/stats/newsletter-stats/', () => {
                return HttpResponse.json({
                    stats: [],
                    meta: {}
                });
            }),
            http.get('/ghost/api/admin/links/', () => {
                return HttpResponse.json({links: []});
            })
        );

        const {result} = renderHook(() => usePostNewsletterStats('post-id'), {wrapper});

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.stats).toEqual({
            sent: 0,
            opened: 0,
            clicked: 200,
            openedRate: 0,
            clickedRate: 0
        });
        expect(result.current.topLinks).toEqual([]);
    });

    it('handles missing count data', async () => {
        server.use(
            http.get('/ghost/api/admin/posts/:id/', () => {
                return HttpResponse.json({
                    posts: [{
                        id: 'post-id',
                        email: {
                            email_count: 1000,
                            opened_count: 500
                        }
                    }]
                });
            }),
            http.get('/ghost/api/admin/stats/newsletter-stats/', () => {
                return HttpResponse.json({
                    stats: [],
                    meta: {}
                });
            }),
            http.get('/ghost/api/admin/links/', () => {
                return HttpResponse.json({links: []});
            })
        );

        const {result} = renderHook(() => usePostNewsletterStats('post-id'), {wrapper});

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.stats).toEqual({
            sent: 1000,
            opened: 500,
            clicked: 0,
            openedRate: 0.5,
            clickedRate: 0
        });
        expect(result.current.topLinks).toEqual([]);
    });

    it('handles missing newsletter stats', async () => {
        server.use(
            http.get('/ghost/api/admin/posts/:id/', () => {
                return HttpResponse.json({
                    posts: [{
                        id: 'post-id',
                        email: {
                            email_count: 1000,
                            opened_count: 500
                        },
                        count: {
                            clicks: 200
                        }
                    }],
                    meta: {}
                });
            }),
            http.get('/ghost/api/admin/stats/newsletter-stats/', () => {
                return HttpResponse.json({stats: undefined});
            }),
            http.get('/ghost/api/admin/links/', () => {
                return HttpResponse.json({links: []});
            })
        );

        const {result} = renderHook(() => usePostNewsletterStats('post-id'), {wrapper});

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.averageStats).toEqual({
            openedRate: 0,
            clickedRate: 0
        });
        expect(result.current.topLinks).toEqual([]);
    });
});
