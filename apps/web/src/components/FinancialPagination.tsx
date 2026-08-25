import { Button } from './ui';
import './financial-pagination.css';

export function FinancialPagination({
  loaded,
  total,
  loading,
  onLoadMore,
  itemLabel,
}: {
  loaded: number;
  total: number;
  loading: boolean;
  onLoadMore: () => void;
  itemLabel: string;
}) {
  return (
    <div className="financial-pagination" role="status">
      <span>
        Mostrando <strong>{loaded}</strong> de <strong>{total}</strong> {itemLabel}.
      </span>
      {loaded < total ? (
        <Button disabled={loading} onClick={onLoadMore} size="sm" variant="secondary">
          {loading ? 'Cargando…' : 'Cargar más'}
        </Button>
      ) : (
        <small>Historial cargado por completo.</small>
      )}
    </div>
  );
}
