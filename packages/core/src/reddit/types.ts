export interface RedditThread {
  /** fullname, e.g. t3_abc123 */
  id: string;
  subreddit: string;
  title: string;
  permalink: string;
  score: number;
  numComments: number;
  postedAt: Date;
  flair?: string | null;
}

export interface RedditComment {
  /** fullname, e.g. t1_xyz */
  id: string;
  threadId: string;
  author: string;
  body: string;
  score: number;
  permalink: string;
  postedAt: Date;
  stickied?: boolean;
  distinguished?: string | null;
}

/** Anything that can answer "find threads" and "get top comments". */
export interface RedditSource {
  readonly name: string;
  readonly isSampleData: boolean;
  searchThreads(subreddit: string, query: string, limit: number): Promise<RedditThread[]>;
  fetchTopComments(thread: RedditThread, limit: number): Promise<RedditComment[]>;
}
