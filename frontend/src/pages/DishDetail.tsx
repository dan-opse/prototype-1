import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ErrorState, Loading } from '../components/States';
import { formatPrice, formatReaction, formatReorder, spiceLabel } from '../components/formatting';
import type { DishDetailResponse } from '../types';

export function DishDetail() {
  const { id } = useParams();
  const [data, setData] = useState<DishDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const menuItemId = Number(id);
    if (!Number.isInteger(menuItemId) || menuItemId <= 0) {
      setError(`"${id}" is not a valid dish id`);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getDish(menuItemId)
      .then(setData)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load that dish'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Loading label="Loading dish…" />;
  if (error) {
    return (
      <>
        <ErrorState message={error} />
        <Link className="button button--ghost" to="/">
          Back to the feed
        </Link>
      </>
    );
  }
  if (!data) return null;

  const { dish, restaurant, recent_notes: notes } = data;

  return (
    <section className="detail">
      <Link className="detail__back" to="/">
        ← Back to the feed
      </Link>

      <header className="detail__head">
        <div>
          <h1>{dish.name}</h1>
          <p className="detail__restaurant">
            {restaurant.name} · {restaurant.cuisine} · {restaurant.address ?? 'Address unavailable'}
          </p>
        </div>
        <span className="detail__price">{formatPrice(dish.price_cents)}</span>
      </header>

      {dish.description && <p className="detail__description">{dish.description}</p>}

      <div className="detail__stats">
        <div className="stat-block">
          <span className="stat-block__value">{formatReaction(dish.average_reaction)}</span>
          <span className="stat-block__label">average reaction</span>
        </div>
        <div className="stat-block">
          <span className="stat-block__value">{formatReorder(dish.reorder_percentage)}</span>
          <span className="stat-block__label">would order again</span>
        </div>
        <div className="stat-block">
          <span className="stat-block__value">{dish.feedback_count}</span>
          <span className="stat-block__label">reviews logged</span>
        </div>
        <div className="stat-block">
          <span className="stat-block__value">{dish.community_score.toFixed(2)}</span>
          <span className="stat-block__label">community score</span>
        </div>
      </div>

      <ul className="detail__facts">
        <li>{dish.category}</li>
        <li>{spiceLabel(dish.spice_level)}</li>
        <li>{dish.is_vegetarian ? 'Vegetarian' : 'Meat or seafood'}</li>
      </ul>

      <section className="detail__section">
        <h2>Common tags</h2>
        {dish.top_tags.length === 0 ? (
          <p className="muted">No tags yet. Log this dish to start the tag history.</p>
        ) : (
          <div className="tag-row">
            {dish.top_tags.map((tag) => (
              <span key={tag.id} className={`tag tag--${tag.kind}`}>
                {tag.name} · {tag.uses}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="detail__section">
        <h2>How this score is built</h2>
        <ul className="breakdown">
          <li>
            <span>Bayesian average reaction</span>
            <span>{dish.score_breakdown.bayesian_average_reaction.toFixed(2)} / 5</span>
          </li>
          <li>
            <span>Reorder rate</span>
            <span>{(dish.score_breakdown.reorder_rate_scaled * 100).toFixed(0)}%</span>
          </li>
          <li>
            <span>Sample-size confidence</span>
            <span>{(dish.score_breakdown.confidence_score * 100).toFixed(0)}%</span>
          </li>
        </ul>
        <p className="muted">
          Raw averages are pulled toward the global average until a dish has enough reviews, so a single glowing
          review cannot outrank a consistently good dish.
        </p>
      </section>

      {notes.length > 0 && (
        <section className="detail__section">
          <h2>Recent notes</h2>
          <ul className="notes">
            {notes.map((note, position) => (
              <li key={position}>
                <span className="notes__meta">
                  {note.display_name} · {note.reaction}/5
                </span>
                <p>{note.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link className="button button--primary" to={`/log?restaurantId=${restaurant.id}&dishId=${dish.menu_item_id}`}>
        Log this meal
      </Link>
    </section>
  );
}
