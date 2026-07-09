import {
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Tab,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	Tabs,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { firstValueFrom } from 'rxjs';
import { PatientsApi } from '../../../generated';
import { customConfiguration } from '../../../libraries/apiUtils/configuration';
import { wrapper } from '../../../libraries/apiUtils/wrapper';

const patientsApi = new PatientsApi(customConfiguration());

// Technical / audit fields hidden from the read-only view (lower-cased field names).
const HIDDEN_FIELDS = new Set([
	'createdby',
	'createddate',
	'lastmodifiedby',
	'lastmodifieddate',
	'active',
	'lock',
]);

const MAX_CELL_LENGTH = 200;

const isHidden = (field: string) => HIDDEN_FIELDS.has(field.toLowerCase());

// Turn a camelCase field name into a capitalized, space-separated label.
const humanize = (name: string) =>
	name
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, (char) => char.toUpperCase())
		.trim();

// Render a value for a table cell: scalars as their text, a nested object by its description or name
// (falling back to compact JSON), capped in length.
const renderValue = (value: unknown): string => {
	if (value === null || value === undefined) {
		return '';
	}
	let text: string;
	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;
		if (typeof record.description === 'string') {
			text = record.description;
		} else if (typeof record.name === 'string') {
			text = record.name;
		} else {
			text = JSON.stringify(value);
		}
	} else {
		text = String(value);
	}
	return text.length > MAX_CELL_LENGTH
		? `${text.slice(0, MAX_CELL_LENGTH)}…`
		: text;
};

const ObjectTable = ({ data }: { data: Record<string, unknown> }) => {
	const { t } = useTranslation();
	return (
		<Table size="small">
			<TableHead>
				<TableRow>
					<TableCell>{t('patient.fullrecordfield')}</TableCell>
					<TableCell>{t('patient.fullrecordvalue')}</TableCell>
				</TableRow>
			</TableHead>
			<TableBody>
				{Object.entries(data)
					.filter(([key]) => !isHidden(key))
					.map(([key, value]) => (
						<TableRow key={key}>
							<TableCell>{humanize(key)}</TableCell>
							<TableCell>{renderValue(value)}</TableCell>
						</TableRow>
					))}
			</TableBody>
		</Table>
	);
};

const ArrayTable = ({ rows }: { rows: unknown[] }) => {
	const columns = Array.from(
		rows.reduce<Set<string>>((set, row) => {
			if (row && typeof row === 'object') {
				Object.keys(row as Record<string, unknown>)
					.filter((key) => !isHidden(key))
					.forEach((key) => {
						set.add(key);
					});
			}
			return set;
		}, new Set<string>()),
	);
	return (
		<Table size="small">
			<TableHead>
				<TableRow>
					{columns.map((column) => (
						<TableCell key={column}>{humanize(column)}</TableCell>
					))}
				</TableRow>
			</TableHead>
			<TableBody>
				{rows.map((row, index) => (
					<TableRow key={index}>
						{columns.map((column) => (
							<TableCell key={column}>
								{renderValue((row as Record<string, unknown>)?.[column])}
							</TableCell>
						))}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
};

interface IProps {
	open: boolean;
	onClose: () => void;
	code: number | undefined;
}

// Read-only, tab-per-category view of a patient full record (GDPR Art. 15, right of access). Fetches the
// aggregate produced for OP-887 and renders the patient object as a field/value table and each linked
// collection (admissions, OPDs, laboratories, ...) as its own table.
const PatientFullRecordView = ({ open, onClose, code }: IProps) => {
	const { t } = useTranslation();
	const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'FAIL'>(
		'IDLE',
	);
	const [record, setRecord] = useState<Record<string, unknown>>({});
	const [activeTab, setActiveTab] = useState(0);

	useEffect(() => {
		if (!open || code === undefined) {
			return;
		}
		setStatus('LOADING');
		setActiveTab(0);
		firstValueFrom(wrapper(() => patientsApi.getPatientFullRecord({ code })))
			.then((data) => {
				setRecord((data ?? {}) as Record<string, unknown>);
				setStatus('SUCCESS');
			})
			.catch(() => setStatus('FAIL'));
	}, [open, code]);

	const entries = Object.entries(record);

	return (
		<Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
			<DialogTitle>{t('patient.fullrecord')}</DialogTitle>
			<DialogContent dividers>
				{status === 'LOADING' && <CircularProgress />}
				{status === 'FAIL' && <span>{t('common.somethingwrong')}</span>}
				{status === 'SUCCESS' && (
					<>
						<Tabs
							value={activeTab}
							onChange={(_event, value) => setActiveTab(value)}
							variant="scrollable"
							scrollButtons="auto"
						>
							{entries.map(([key, value]) => (
								<Tab
									key={key}
									label={
										humanize(key) +
										(Array.isArray(value) ? ` (${value.length})` : '')
									}
								/>
							))}
						</Tabs>
						{entries.map(([key, value], index) =>
							index === activeTab ? (
								<div key={key} style={{ overflowX: 'auto', marginTop: 16 }}>
									{Array.isArray(value) ? (
										<ArrayTable rows={value as unknown[]} />
									) : (
										<ObjectTable
											data={(value ?? {}) as Record<string, unknown>}
										/>
									)}
								</div>
							) : null,
						)}
					</>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>{t('common.close')}</Button>
			</DialogActions>
		</Dialog>
	);
};

export default PatientFullRecordView;
