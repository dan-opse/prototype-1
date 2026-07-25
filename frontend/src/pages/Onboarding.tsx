import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { formatPrice, spiceLabel } from '../components/formatting';
import { useUser } from '../state/UserContext';
import type { FeedDish, OnboardingStatus } from '../types';

export function Onboarding() {
  const navigate = useNavigate();
  const { currentUser, refresh } = useUser();
  const [items, setItems] = useState<FeedDish[]>([]);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.getQuizItems(currentUser.id);
      setItems(response.items);
      setStatus(response.onboarding);
      setIndex(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the quiz');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  async function answer(liked: boolean) {
    if (!currentUser || submitting) return;
    const dish = items[index];
    if (!dish) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await api.submitSwipe(currentUser.id, dish.menu_item_id, liked);
      setStatus(response.onboarding);
      if (index + 1 >= items.length) {
        await refresh();
        navigate('/');
      } else {
        setIndex(index + 1);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that answer');
    } finally {
      setSubmitting(false);
    }
  }

  async function restart() {
    if (!currentUser) return;
    await api.resetQuiz(currentUser.id);
    await refresh();
    await load();
  }

  if (!currentUser) {
    return <EmptyState title="Pick a diner first" hint="Choose or create a diner above to take the taste quiz." />;
  }

  if (loading) return <Loading label="Building your quiz…" />;
  if (error) return <ErrorState message={error} />;

  if (items.length === 0) {
    return (
      <section className="quiz">
        <EmptyState
          title="Quiz complete"
          hint={`${status?.swipe_count ?? 0} answers recorded. Your For You feed is seeded — logging real meals will sharpen it.`}
        />
        <div className="quiz__actions">
          <Link className="button button--primary" to="/">
            See your feed
          </Link>
          <button className="button button--ghost" type="button" onClick={restart}>
            Retake the quiz
          </button>
        </div>
      </section>
    );
  }

  const dish = items[index];
  const answered = status ? status.swipe_count : 0;
  const total = status?.quiz_length ?? items.length;

  return (
    <section className="quiz">
      <header className="page-head">
        <h1>Would you order this?</h1>
        <p className="page-head__sub">
          Ten quick answers seed your taste profile before you have logged a single meal. Structural traits
          (cuisine, price, spice) count fully right away; taste tags count more once you log real meals.
        </p>
      </header>

      <div className="quiz__progress">
        <div className="quiz__progress-bar">
          <div className="quiz__progress-fill" style={{ width: `${Math.min(100, (answered / total) * 100)}%` }} />
        </div>
        <span>
          {Math.min(answered + 1, total)} of {total}
        </span>
      </div>

      <article className="quiz-card">
        <h2>{dish.name}</h2>
        <p className="quiz-card__restaurant">
          {dish.restaurant.name} · {dish.restaurant.cuisine}
        </p>
        {dish.description && <p className="quiz-card__description">{dish.description}</p>}
        <ul className="quiz-card__facts">
          <li>{formatPrice(dish.price_cents)}</li>
          <li>{spiceLabel(dish.spice_level)}</li>
          <li>{dish.is_vegetarian ? 'Vegetarian' : 'Meat or seafood'}</li>
        </ul>
        {dish.top_tags.length > 0 && (
          <div className="tag-row">
            {dish.top_tags.map((tag) => (
              <span key={tag.id} className={`tag tag--${tag.kind}`}>
                {tag.name}
              </span>
            ))}
          </div>
        )}
        {dish.top_tags.length === 0 && (
          <p className="quiz-card__cold">No community tags yet — this answer teaches us structure only.</p>
        )}
      </article>

      <div className="quiz__actions">
        <button className="button button--no" type="button" disabled={submitting} onClick={() => answer(false)}>
          No thanks
        </button>
        <button className="button button--yes" type="button" disabled={submitting} onClick={() => answer(true)}>
          Yes, I'd order it
        </button>
      </div>
    </section>
  );
}
