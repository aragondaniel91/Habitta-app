import { Field } from './ui';
import {
  COUNTRY_OPTIONS,
  CURRENCY_OPTIONS,
  PROPERTY_TOPOLOGY_OPTIONS,
  TIMEZONE_OPTIONS,
  suggestedCurrency,
  suggestedLegalIdType,
  suggestedTimezone,
  type AdminOnboardingErrors,
  type AdminOnboardingInput,
  type PropertyTopology,
} from '../lib/adminOnboarding';

type Props = {
  input: AdminOnboardingInput;
  errors: AdminOnboardingErrors;
  onChange: (key: keyof AdminOnboardingInput, value: string) => void;
  autoFocusName?: boolean;
};

export function CondominiumProfileFields({ input, errors, onChange, autoFocusName }: Props) {
  const selectTopology = (topology: PropertyTopology) => {
    onChange('propertyTopology', topology);
    if (topology === 'house_community') {
      onChange('declaredBuildingCount', '');
      onChange('firstBuildingName', '');
    } else if (topology === 'single_building') {
      onChange('declaredBuildingCount', '1');
    } else if (topology === 'multi_building_complex') {
      onChange('declaredUnitCount', '');
      onChange('firstBuildingName', '');
    } else {
      onChange('firstBuildingName', '');
    }
  };

  return (
    <>
      <div className="admin-onboarding-section-heading">
        <span>Identificación</span>
        <h3>Datos del condominio</h3>
        <p>Usaremos esta información en reportes, comunicaciones y documentos administrativos.</p>
      </div>

      <div className="admin-onboarding-fields">
        <Field error={errors.condominiumName} label="Nombre del condominio">
          <input
            autoFocus={autoFocusName}
            className="input"
            maxLength={120}
            onChange={(event) => onChange('condominiumName', event.target.value)}
            placeholder="Ejemplo: Residencias Los Pinos"
            value={input.condominiumName}
          />
        </Field>

        <Field
          hint="Opcional. Úsalo si la denominación registrada es diferente al nombre conocido."
          label="Nombre legal"
        >
          <input
            className="input"
            maxLength={160}
            onChange={(event) => onChange('legalName', event.target.value)}
            placeholder="Ejemplo: Condominio Residencias Los Pinos"
            value={input.legalName}
          />
        </Field>

        <Field error={errors.countryCode} label="País">
          <select
            className="select"
            onChange={(event) => {
              const countryCode = event.target.value;
              const primaryCurrencyCode = suggestedCurrency(countryCode);
              onChange('countryCode', countryCode);
              onChange('timezone', suggestedTimezone(countryCode));
              onChange('primaryCurrencyCode', primaryCurrencyCode);
              onChange('secondaryCurrencyCode', primaryCurrencyCode === 'USD' ? '' : 'USD');
              if (!input.legalIdNumber.trim()) {
                onChange('legalIdType', suggestedLegalIdType(countryCode));
              }
            }}
            value={input.countryCode}
          >
            {COUNTRY_OPTIONS.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          error={errors.legalIdType}
          hint={input.countryCode === 'VE' ? 'En Venezuela se sugiere RIF.' : 'Ejemplo: Tax ID, RUC, NIT.'}
          label="Tipo de identificación legal"
        >
          <input
            className="input"
            maxLength={40}
            onChange={(event) => onChange('legalIdType', event.target.value.toUpperCase())}
            placeholder={input.countryCode === 'VE' ? 'RIF' : 'Tipo de identificación'}
            value={input.legalIdType}
          />
        </Field>

        <Field
          error={errors.legalIdNumber}
          hint="Opcional durante la configuración inicial; si indicas un tipo, completa también el número."
          label={input.countryCode === 'VE' ? 'RIF del condominio' : 'Identificación legal'}
        >
          <input
            className="input"
            maxLength={80}
            onChange={(event) => onChange('legalIdNumber', event.target.value.toUpperCase())}
            placeholder={input.countryCode === 'VE' ? 'J-12345678-9' : 'Número de identificación'}
            value={input.legalIdNumber}
          />
        </Field>
      </div>

      <div className="admin-onboarding-section-heading">
        <span>Ubicación</span>
        <h3>Dirección del condominio</h3>
      </div>

      <div className="admin-onboarding-fields">
        <Field error={errors.addressLine1} label="Dirección principal">
          <input
            className="input"
            maxLength={240}
            onChange={(event) => onChange('addressLine1', event.target.value)}
            placeholder="Avenida, calle, urbanización y número"
            value={input.addressLine1}
          />
        </Field>

        <Field hint="Opcional" label="Referencia o dirección adicional">
          <input
            className="input"
            maxLength={240}
            onChange={(event) => onChange('addressLine2', event.target.value)}
            placeholder="Sector, punto de referencia, etc."
            value={input.addressLine2}
          />
        </Field>

        <Field label={input.countryCode === 'VE' ? 'Estado' : 'Estado / región'}>
          <input
            className="input"
            maxLength={100}
            onChange={(event) => onChange('stateRegion', event.target.value)}
            placeholder={input.countryCode === 'VE' ? 'Ejemplo: Miranda' : 'Estado o región'}
            value={input.stateRegion}
          />
        </Field>

        <Field label="Municipio">
          <input
            className="input"
            maxLength={100}
            onChange={(event) => onChange('municipality', event.target.value)}
            placeholder="Municipio"
            value={input.municipality}
          />
        </Field>

        {input.countryCode === 'VE' ? (
          <Field label="Parroquia">
            <input
              className="input"
              maxLength={100}
              onChange={(event) => onChange('parish', event.target.value)}
              placeholder="Parroquia"
              value={input.parish}
            />
          </Field>
        ) : null}

        <Field error={errors.city} label="Ciudad">
          <input
            className="input"
            maxLength={100}
            onChange={(event) => onChange('city', event.target.value)}
            placeholder="Ciudad"
            value={input.city}
          />
        </Field>

        <Field hint="Opcional" label="Código postal">
          <input
            className="input"
            maxLength={20}
            onChange={(event) => onChange('postalCode', event.target.value)}
            placeholder="Código postal"
            value={input.postalCode}
          />
        </Field>

        <Field error={errors.timezone} label="Zona horaria">
          <select
            className="select"
            onChange={(event) => onChange('timezone', event.target.value)}
            value={input.timezone}
          >
            {TIMEZONE_OPTIONS.map((timezone) => (
              <option key={timezone.value} value={timezone.value}>
                {timezone.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="admin-onboarding-section-heading">
        <span>Estructura física</span>
        <h3>¿Qué tipo de propiedad administra este condominio?</h3>
        <p>Habitta adaptará Unidades y Edificios a esta estructura.</p>
      </div>

      <Field error={errors.propertyTopology} label="Tipo de propiedad">
        <div className="property-topology-grid">
          {PROPERTY_TOPOLOGY_OPTIONS.map((choice) => {
            const selected = input.propertyTopology === choice.value;
            return (
              <button
                aria-pressed={selected}
                className="property-topology-choice"
                data-selected={selected || undefined}
                key={choice.value}
                onClick={() => selectTopology(choice.value)}
                type="button"
              >
                <strong>{choice.title}</strong>
                <small>{choice.description}</small>
              </button>
            );
          })}
        </div>
      </Field>

      <div className="admin-onboarding-fields">
        {input.propertyTopology === 'house_community' ? (
          <Field
            error={errors.declaredUnitCount}
            hint="La cantidad real se podrá completar o importar después."
            label="¿Cuántas casas administra el condominio?"
          >
            <input
              className="input"
              inputMode="numeric"
              max="100000"
              min="1"
              onChange={(event) => onChange('declaredUnitCount', event.target.value)}
              placeholder="Ejemplo: 80"
              type="number"
              value={input.declaredUnitCount}
            />
          </Field>
        ) : null}

        {input.propertyTopology === 'single_building' ? (
          <>
            <Field
              error={errors.declaredUnitCount}
              label="¿Cuántos apartamentos o unidades administra el edificio?"
            >
              <input
                className="input"
                inputMode="numeric"
                max="100000"
                min="1"
                onChange={(event) => onChange('declaredUnitCount', event.target.value)}
                placeholder="Ejemplo: 48"
                type="number"
                value={input.declaredUnitCount}
              />
            </Field>
            <Field
              hint="Opcional. Si lo dejas vacío usaremos el nombre del condominio."
              label="Nombre del edificio"
            >
              <input
                className="input"
                maxLength={120}
                onChange={(event) => onChange('firstBuildingName', event.target.value)}
                placeholder="Ejemplo: Torre Parque"
                value={input.firstBuildingName}
              />
            </Field>
          </>
        ) : null}

        {input.propertyTopology === 'multi_building_complex' ? (
          <Field
            error={errors.declaredBuildingCount}
            hint="Después podrás nombrar y configurar cada edificio con sus propias unidades."
            label="¿Cuántos edificios o torres administra el condominio general?"
          >
            <input
              className="input"
              inputMode="numeric"
              max="10000"
              min="2"
              onChange={(event) => onChange('declaredBuildingCount', event.target.value)}
              placeholder="Ejemplo: 4"
              type="number"
              value={input.declaredBuildingCount}
            />
          </Field>
        ) : null}

        {input.propertyTopology === 'mixed' ? (
          <>
            <Field error={errors.declaredBuildingCount} hint="Opcional" label="Edificios o torres">
              <input
                className="input"
                inputMode="numeric"
                max="10000"
                min="1"
                onChange={(event) => onChange('declaredBuildingCount', event.target.value)}
                type="number"
                value={input.declaredBuildingCount}
              />
            </Field>
            <Field error={errors.declaredUnitCount} hint="Opcional" label="Unidades conocidas">
              <input
                className="input"
                inputMode="numeric"
                max="100000"
                min="1"
                onChange={(event) => onChange('declaredUnitCount', event.target.value)}
                type="number"
                value={input.declaredUnitCount}
              />
            </Field>
          </>
        ) : null}
      </div>

      <div className="admin-onboarding-section-heading">
        <span>Finanzas</span>
        <h3>Monedas del condominio</h3>
        <p>Los saldos se mantienen separados; Habitta no mezcla monedas automáticamente.</p>
      </div>

      <div className="admin-onboarding-fields">
        <Field error={errors.primaryCurrencyCode} label="Moneda principal">
          <select
            className="select"
            onChange={(event) => onChange('primaryCurrencyCode', event.target.value)}
            value={input.primaryCurrencyCode}
          >
            {CURRENCY_OPTIONS.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          error={errors.secondaryCurrencyCode}
          hint="Opcional. Habitta mantendrá saldos separados por moneda."
          label="Moneda secundaria"
        >
          <select
            className="select"
            onChange={(event) => onChange('secondaryCurrencyCode', event.target.value)}
            value={input.secondaryCurrencyCode}
          >
            <option value="">Sin moneda secundaria</option>
            {CURRENCY_OPTIONS.filter(
              (currency) => currency.code !== input.primaryCurrencyCode,
            ).map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </>
  );
}
