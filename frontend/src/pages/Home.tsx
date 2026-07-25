import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { DishCard } from '../components/DishCard';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useUser } from '../state/UserContext';
import type { FeedDish } from '../types';

type Tab = 'for-you' | 'community';

export function Home() {
  const { currentUser, onboarding } = useUser();
  const [tab, setTab] = useState<Tab>('for-you');
  const [dishes, setDishes] = useState<FeedDish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'community' || !currentUser) {
        setDishes(await api.getCommunityFeed());
      } else {
        const response = await api.getForYouFeed(currentUser.id);
        setDishes(response.dishes);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the feed');
    } finally {
      setLoading(false);
    }
  }, [tab, currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const needsQuiz = Boolean(currentUser && onboarding && !onboarding.has_completed_quiz && onboarding.log_count === 0);

  return (
    <section>
      <header className="page-head">
        <h1>What should you order tonight?</h1>
        <p className="page-head__sub">
          Individual dishes from every restaurant in the dataset, ranked by how the community rated them and how
          well they fit your taste.
        </p>
      </header>

      {!currentUser && (
        <EmptyState
          title="Pick a diner to personalize this feed"
          hint="Use the selector above, or create a new diner and take the taste quiz. Until then you are seeing the community ranking."
        />
      )}

      {needsQuiz && (
        <div className="banner">
          <div>
            <strong>Your For You feed is still generic.</strong>
            <p>
              Answer {onboarding!.quiz_length - onboarding!.swipe_count} more quick questions to seed a taste
              profile.
            </p>
          </div>
          <Link className="button button--primary" to="/onboarding">
            Take the taste quiz
          </Link>
        </div>
      )}

      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'for-you'}
          className={`tabs__tab ${tab === 'for-you' ? 'is-active' : ''}`}
          onClick={() => setTab('for-you')}
        >
          For You
        </button>
        <button
          role="tab"
          aria-selected={tab === 'community'}
          className={`tabs__tab ${tab === 'community' ? 'is-active' : ''}`}
          onClick={() => setTab('community')}
        >
          Community
        </button>
      </div>

      <p className="tabs__caption">
        {tab === 'for-you'
          ? 'Community score blended with how closely each dish matches your taste profile.'
          : 'Ranked by community score alone — the same list for everyone.'}
      </p>

      {loading && <Loading label="Ranking dishes…" />}
      {error && <ErrorState message={error} />}
      {!loading && !error && dishes.length === 0 && (
        <EmptyState title="No dishes to show" hint="The database looks empty. Re-seed it and try again." />
      )}

      {!loading && !error && dishes.length > 0 && (
        <div className="dish-grid">
          {dishes.map((dish) => (
            <DishCard key={dish.menu_item_id} dish={dish} />
          ))}
        </div>
      )}
    </section>
  );
}
