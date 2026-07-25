import { Link } from 'react-router-dom';
import type { FeedDish } from '../types';
import { formatPrice, formatReaction, formatReorder } from './formatting';

interface Props {
  dish: FeedDish;
  showDescription?: boolean;
}

export function DishCard({ dish, showDescription = false }: Props) {
  return (
    <Link className="dish-card" to={`/dish/${dish.menu_item_id}`}>
      <div className="dish-card__head">
        <div>
          <h3 className="dish-card__name">{dish.name}</h3>
          <p className="dish-card__restaurant">
            {dish.restaurant.name} · {dish.restaurant.cuisine}
          </p>
        </div>
        <span className="dish-card__price">{formatPrice(dish.price_cents)}</span>
      </div>

      {showDescription && dish.description && <p className="dish-card__description">{dish.description}</p>}

      <div className="dish-card__stats">
        <span className="stat">
          <span className="stat__value">{formatReaction(dish.average_reaction)}</span>
          <span className="stat__label">avg reaction</span>
        </span>
        <span className="stat">
          <span className="stat__value">{formatReorder(dish.reorder_percentage)}</span>
          <span className="stat__label">would reorder</span>
        </span>
        <span className="stat">
          <span className="stat__value">{dish.feedback_count}</span>
          <span className="stat__label">{dish.feedback_count === 1 ? 'review' : 'reviews'}</span>
        </span>
      </div>

      {dish.feedback_count === 0 && <p className="dish-card__cold">No reviews yet — be the first to log it</p>}

      {dish.top_tags.length > 0 && (
        <div className="tag-row">
          {dish.top_tags.slice(0, 3).map((tag) => (
            <span key={tag.id} className={`tag tag--${tag.kind}`}>
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {dish.reason && <p className="dish-card__reason">{dish.reason}</p>}
    </Link>
  );
}
