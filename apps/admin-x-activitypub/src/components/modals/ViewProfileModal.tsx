import React, {useEffect, useRef, useState} from 'react';

import NiceModal, {useModal} from '@ebay/nice-modal-react';

import {Button, Heading, Icon, List, Modal, NoValueLabel, Tab,TabView, useDesignSystem} from '@tryghost/admin-x-design-system';
import {LoadingIndicator} from '@tryghost/shade';
import {UseInfiniteQueryResult} from '@tanstack/react-query';
import {useAccountFollowsForUser, useAccountForUser, usePostsByAccount} from '@hooks/use-activity-pub-queries';

import APAvatar from '../global/APAvatar';
import ActivityItem from '../activities/ActivityItem';
import FeedItem from '../feed/FeedItem';
import FollowButton from '../global/FollowButton';
import Separator from '../global/Separator';
import getName from '../../utils/get-name';
import getUsername from '../../utils/get-username';
import {handleProfileClick} from '../../utils/handle-profile-click';
import {handleViewContent} from '../../utils/content-handlers';
import type {AccountFollowsType, GetAccountFollowsResponse, GetProfileFollowersResponse, GetProfileFollowingResponse} from '../../api/activitypub';

const noop = () => {};

type QueryPageData = GetProfileFollowersResponse | GetProfileFollowingResponse | GetAccountFollowsResponse;

type QueryFn = (handle: string, profileHandle: string) => UseInfiniteQueryResult<QueryPageData>;

type ActorListProps = {
    handle: string,
    noResultsMessage: string,
    queryFn: QueryFn,
    resolveDataFn: (data: QueryPageData) => GetProfileFollowersResponse['followers'] | GetProfileFollowingResponse['following'];
};

const ActorList: React.FC<ActorListProps> = ({
    handle,
    noResultsMessage,
    queryFn,
    resolveDataFn
}) => {
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading
    } = queryFn('index', handle);

    const actors = (data?.pages.flatMap(resolveDataFn) ?? []);

    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (observerRef.current) {
            observerRef.current.disconnect();
        }

        observerRef.current = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
            }
        });

        if (loadMoreRef.current) {
            observerRef.current.observe(loadMoreRef.current);
        }

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    return (
        <div className='pt-3'>
            {
                hasNextPage === false && actors.length === 0 ? (
                    <NoValueLabel icon='user-add'>
                        {noResultsMessage}
                    </NoValueLabel>
                ) : (
                    <List>
                        {actors.map(({actor, isFollowing}) => {
                            return (
                                <React.Fragment key={actor.id}>
                                    <ActivityItem key={actor.id}
                                        onClick={() => handleProfileClick(actor)}
                                    >
                                        <APAvatar author={actor} />
                                        <div>
                                            <div className='text-gray-600'>
                                                <span className='mr-1 font-bold text-black'>{getName(actor)}</span>
                                                <div className='text-sm'>{getUsername(actor)}</div>
                                            </div>
                                        </div>
                                        <FollowButton
                                            className='ml-auto'
                                            following={isFollowing}
                                            handle={getUsername(actor)}
                                            type='secondary'
                                        />
                                    </ActivityItem>
                                </React.Fragment>
                            );
                        })}
                    </List>
                )
            }
            <div ref={loadMoreRef} className='h-1'></div>
            {
                (isFetchingNextPage || isLoading) && (
                    <div className='mt-6 flex flex-col items-center justify-center space-y-4 text-center'>
                        <LoadingIndicator size='md' />
                    </div>
                )
            }
        </div>
    );
};

const PostsTab: React.FC<{handle: string}> = ({handle}) => {
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading
    } = usePostsByAccount(handle, {enabled: true}).postsByAccountQuery;

    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (observerRef.current) {
            observerRef.current.disconnect();
        }

        observerRef.current = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
            }
        });

        if (loadMoreRef.current) {
            observerRef.current.observe(loadMoreRef.current);
        }

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const posts = (data?.pages.flatMap(page => page.posts) ?? [])
        .filter(post => (post.type === 'Announce' || post.type === 'Create') && !post.object?.inReplyTo);

    return (
        <div>
            {
                hasNextPage === false && posts.length === 0 ? (
                    <NoValueLabel icon='pen'>
                        {handle} has not posted anything yet
                    </NoValueLabel>
                ) : (
                    <>
                        {posts.map((post, index) => (
                            <div>
                                <FeedItem
                                    actor={post.actor}
                                    allowDelete={post.object.authored}
                                    commentCount={post.object.replyCount}
                                    layout='feed'
                                    object={post.object}
                                    repostCount={post.object.repostCount}
                                    type={post.type}
                                    onClick={() => handleViewContent({
                                        ...post,
                                        id: post.object.id
                                    }, false)}
                                    onCommentClick={() => handleViewContent({
                                        ...post,
                                        id: post.object.id
                                    }, true)}
                                />
                                {index < posts.length - 1 && <Separator />}
                            </div>
                        ))}
                    </>
                )
            }
            <div ref={loadMoreRef} className='h-1'></div>
            {
                (isFetchingNextPage || isLoading) && (
                    <div className='mt-6 flex flex-col items-center justify-center space-y-4 text-center'>
                        <LoadingIndicator size='md' />
                    </div>
                )
            }
        </div>
    );
};

const useAccountFollowsQuery = (handle: string, type: AccountFollowsType) => {
    const query = useAccountFollowsForUser(handle === '' ? 'me' : handle, type);
    return () => query;
};

const FollowingTab: React.FC<{handle: string}> = ({handle}) => {
    const queryFn = useAccountFollowsQuery(handle, 'following');

    return (
        <ActorList
            handle={handle}
            noResultsMessage={`${handle} is not following anyone yet`}
            queryFn={queryFn}
            resolveDataFn={page => ('following' in page ? page.following : [])}
        />
    );
};

const FollowersTab: React.FC<{handle: string}> = ({handle}) => {
    const queryFn = useAccountFollowsQuery(handle, 'followers');

    return (
        <ActorList
            handle={handle}
            noResultsMessage={`${handle} has no followers yet`}
            queryFn={queryFn}
            resolveDataFn={page => ('followers' in page ? page.followers : [])}
        />
    );
};

interface ViewProfileModalProps {
    handle: string;
    onFollow?: () => void;
    onUnfollow?: () => void;
}

type ProfileTab = 'posts' | 'following' | 'followers';

const ViewProfileModal: React.FC<ViewProfileModalProps> = ({
    handle,
    onFollow = noop,
    onUnfollow = noop
}) => {
    const modal = useModal();
    const [selectedTab, setSelectedTab] = useState<ProfileTab>('posts');
    const {darkMode} = useDesignSystem();

    const {data: profile, isLoading} = useAccountForUser('index', handle);

    const attachments = profile?.attachment || [];

    const tabs = isLoading === false && profile ? [
        {
            id: 'posts',
            title: 'Posts',
            contents: (
                <PostsTab handle={profile.handle} />
            )
        },
        {
            id: 'following',
            title: 'Following',
            contents: (
                <FollowingTab handle={profile.handle} />
            ),
            counter: profile.followingCount
        },
        {
            id: 'followers',
            title: 'Followers',
            contents: (
                <FollowersTab handle={profile.handle} />
            ),
            counter: profile.followerCount
        }
    ].filter(Boolean) as Tab<ProfileTab>[] : [];

    const [isExpanded, setisExpanded] = useState(false);

    const toggleExpand = () => {
        setisExpanded(!isExpanded);
    };

    const contentRef = useRef<HTMLDivElement | null>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);

    useEffect(() => {
        if (contentRef.current) {
            setIsOverflowing(contentRef.current.scrollHeight > 160); // Compare content height to max height
        }
    }, [isExpanded, profile]);

    return (
        <Modal
            align='right'
            animate={true}
            backDrop={darkMode}
            footer={<></>}
            height={'full'}
            padding={false}
            size='bleed'
            width={640}
        >
            <div className='sticky top-0 z-50 border-gray-200 bg-white py-3 dark:border-gray-950 dark:bg-black'>
                <div className='grid h-8 grid-cols-3'>
                    <div className='col-[3/4] flex items-center justify-end space-x-6 px-8'>
                        <Button className='transition-color flex size-10 items-center justify-center rounded-full bg-white hover:bg-gray-100 dark:bg-black dark:hover:bg-gray-950' icon='close' size='sm' unstyled onClick={() => modal.remove()}/>
                    </div>
                </div>
            </div>
            <div className='z-0 mx-auto mt-4 flex w-full max-w-[580px] flex-col items-center pb-16'>
                <div className='mx-auto w-full'>
                    {isLoading && (
                        <LoadingIndicator size='lg' />
                    )}
                    {!isLoading && !profile && (
                        <NoValueLabel icon='user-add'>
                            Profile not found
                        </NoValueLabel>
                    )}
                    {!isLoading && profile && (
                        <>
                            {profile.bannerImageUrl && (<div className='h-[200px] w-full overflow-hidden rounded-lg bg-gradient-to-tr from-gray-200 to-gray-100'>
                                <img
                                    alt={profile.name}
                                    className='size-full object-cover'
                                    src={profile.bannerImageUrl}
                                />
                            </div>)}
                            <div className={`${profile.bannerImageUrl && '-mt-12'} px-6`}>
                                <div className='flex items-end justify-between'>
                                    <div className='-ml-2 rounded-full bg-white p-1 dark:bg-black'>
                                        <APAvatar
                                            author={{
                                                icon: {url: profile.avatarUrl},
                                                name: profile.name,
                                                handle: profile.handle
                                            }}
                                            size='lg'
                                        />
                                    </div>
                                    <FollowButton
                                        following={profile.followedByMe}
                                        handle={profile.handle}
                                        type='primary'
                                        onFollow={onFollow}
                                        onUnfollow={onUnfollow}
                                    />
                                </div>
                                <Heading className='mt-4' level={3}>{profile.name}</Heading>
                                <a className='group/handle mt-1 flex items-center gap-1 text-[1.5rem] text-gray-800 hover:text-gray-900' href={profile.url} rel='noopener noreferrer' target='_blank'><span>{profile.handle}</span><Icon className='opacity-0 transition-opacity group-hover/handle:opacity-100' name='arrow-top-right' size='xs'/></a>
                                {(profile.bio || attachments.length > 0) && (<div ref={contentRef} className={`ap-profile-content transition-max-height relative text-[1.5rem] duration-300 ease-in-out [&>p]:mb-3 ${isExpanded ? 'max-h-none pb-7' : 'max-h-[160px] overflow-hidden'} relative`}>
                                    <div
                                        dangerouslySetInnerHTML={{__html: profile.bio}}
                                        className='ap-profile-content mt-3 text-[1.5rem] [&>p]:mb-3'
                                    />
                                    {attachments.map((attachment: {name: string, value: string}) => (
                                        <span className='mt-3 line-clamp-1 flex flex-col text-[1.5rem]'>
                                            <span className={`text-xs font-semibold`}>{attachment.name}</span>
                                            <span dangerouslySetInnerHTML={{__html: attachment.value}} className='ap-profile-content truncate'/>
                                        </span>
                                    ))}
                                    {!isExpanded && isOverflowing && (
                                        <div className='absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white via-white/90 via-60% to-transparent' />
                                    )}
                                    {isOverflowing && <Button
                                        className='absolute bottom-0'
                                        label={isExpanded ? 'Show less' : 'Show all'}
                                        link={true}
                                        size='sm'
                                        onClick={toggleExpand}
                                    />}
                                </div>)}
                                <TabView<ProfileTab>
                                    containerClassName='mt-6'
                                    selectedTab={selectedTab}
                                    tabs={tabs}
                                    onTabChange={setSelectedTab}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default NiceModal.create(ViewProfileModal);
