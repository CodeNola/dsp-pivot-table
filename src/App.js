/*
  Analytics Hub - Created by Olatunji Eniola
  Combined platform: Concessions Analytics + Late Delivery Deep Dive
*/
import React, { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import _ from 'lodash';
import { Upload, AlertCircle, X, Plus, ChevronRight, ChevronDown, Download, Eye, EyeOff, Settings, ArrowLeft, BarChart3, Clock, TrendingDown, LayoutGrid, ShieldCheck, Target, Truck, Zap } from 'lucide-react';
import { WATCHTOWER_HTML_B64, WWSC_HTML_B64 } from './dashboards';

// ============================================================
// COACHING TIPS CONFIGS
// ============================================================

const CONCESSION_COACHING = {
  'speedy scanning': 'Def: Swiped to finish within 20 sec of another delivery (2x DNR risk). Action: Complete one delivery at a time. Wait 10+ sec between swipes.',
  'speedy': 'Def: Swiped to finish within 20 sec of another delivery. Action: One piece flow - complete each delivery fully before starting next.',
  'device >50 meters': 'Def: Package scanned >50m from delivery GPS point. Action: Coach driver to scan at actual delivery location, not from vehicle.',
  'device': 'Def: Scan location didn\'t match delivery point. Action: Ensure driver scans package at the door, not in vehicle or street.',
  '50 meters': 'Def: Scanned too far from delivery location. Action: Coach proper scan location - at the delivery point.',
  'driver behavior': 'Def: DNR attributed to driver actions/patterns. Action: Review scan timing, photo quality, and delivery sequence. Coach on standard work.',
  'behavior': 'Def: Driver pattern contributed to DNR. Action: Deep dive delivery practices, identify specific behavior to correct.',
  'no attribution': 'Def: No single root cause identified. Action: Review distance, timing, POD, and circumstantial signals to find patterns.',
  'no root cause': 'Def: Cannot determine specific cause. Action: Look at all available data points for this driver.',
  'cs misattribution': 'Def: DNR may be incorrectly attributed via CS ticket. Action: Review original ticket, may need data correction.',
  'misattribution': 'Def: Possible incorrect attribution. Action: Verify if DNR correctly belongs to this driver/delivery.',
  'customer': 'Def: Customer-initiated complaint. Action: Review delivery photo, instructions, and customer history.',
  'repeat address': 'Def: Address with multiple DNRs in last 30 days. Action: Deep dive, submit FQA ticket for customer pattern analysis.',
  'egregious zip': 'Def: Delivery in zipcode with higher than normal DPMO. Action: Investigate area root cause, review with all affected drivers.',
  'outside business hours': 'Def: Delivery completed outside marked business hours. Action: Verify timing - may indicate interception risk or wrong location.',
  'business hours': 'Def: Delivered when business was closed. Action: Check delivery instructions and business operating hours.',
  'nursery route': 'Def: DNR on route assigned to driver in training (LC DA). Action: Ensure trainee stays on assigned route, provide pre-route quality reminders.',
  'nursery': 'Def: New driver issue. Action: Additional coaching and ride-along if needed.',
  'group stop': 'Def: DNR at group stop where multiple packages swiped together. Action: Coach to check each label individually, verify address before leaving.',
  'group': 'Def: Multi-package stop error. Action: Standard work - one package at a time, verify each label.',
  'no pod': 'Def: No Photo on Delivery captured. Action: Coach to always take clear photo showing package and surroundings.',
  'pod': 'Def: Photo on Delivery issue. Action: Ensure photo clearly shows package placement and address identifier.',
  'photo': 'Def: Missing or unclear delivery photo. Action: Take photo showing package, surroundings, and address when possible.',
  'doorstep': 'Def: Left at doorstep but DNR occurred. Action: Ensure secure placement, avoid visible locations, use delivery instructions.',
  'household member': 'Def: Handed to person at address. Action: When possible, verify recipient and note description.',
  'household': 'Def: Given to household member. Action: Confirm recipient awareness.',
  'clerk': 'Def: Delivered to store/building clerk. Action: Get name, verify they can receive packages for customer.',
  'guard': 'Def: Delivered to security guard. Action: Get guard name/ID and confirmation.',
  'receptionist': 'Def: Delivered to front desk. Action: Get receptionist name and log delivery.',
  'concierge': 'Def: Given to building concierge. Action: Ensure concierge logs receipt, get name.',
  'mailroom': 'Def: Left in mailroom (apartments, offices). Action: Follow standard work, check labels, deliver to correct unit if possible.',
  'porch piracy': 'Def: Package stolen after delivery. Action: Review photo, timing, and placement. Consider secure location options.',
  'piracy': 'Def: Theft suspected post-delivery. Action: Verify photo shows secure placement.',
  'stolen': 'Def: Package reported stolen. Action: Check delivery photo quality and placement.',
  'misdelivered': 'Def: Package delivered to wrong address. Action: Reinforce label verification at every stop.',
  'wrong address': 'Def: Incorrect delivery location. Action: Coach on checking address before leaving.',
  'missing': 'Def: Item missing from package/shipment. Action: Review handling, may be upstream issue.',
  'high value item': 'Def: DNR on high-value package. Action: Prioritize coaching, review all behavioral signals.',
  'high value': 'Def: High-value package DNR. Action: Ensure photo, secure placement, and recipient verification when possible.',
  'sds': 'Def: Marked by SDS (airplane mode/cell service sync issue). Action: Ensure drivers sync device when back online.',
  'sync': 'Def: Device didn\'t sync properly. Action: Coach on syncing device regularly, especially after offline periods.',
  'partner': 'Def: Partner-related attribution. Action: Review with appropriate team.',
  'access': 'Def: Could not access delivery location. Action: Note access codes/instructions for future.',
  'weather': 'Def: Weather may have been factor. Action: Document conditions, ensure secure placement in bad weather.',
  'geo': 'Def: Geopoint mismatch between scan and delivery location. Action: Contact support if recurring, verify correct address.',
  'cdf feed': 'Def: Data feed issue (chatbot signal coming soon). Action: May be system issue, document for support.',
};

const LATE_DELIVERY_COACHING = {
  'late dispatch': 'Def: Package dispatched from station after cutoff time. Action: Review loadout process, ensure drivers depart on schedule. Coach DSP on dispatch SOP compliance.',
  'not dispatched': 'Def: Package was never dispatched to a driver. Action: Investigate why package was skipped. Check staging, route assignment, and loadout process.',
  'not inducted on time': 'Def: Package arrived at station but wasn\'t inducted before MNR cutoff. Action: Review induction process timing, staffing levels, and volume forecasting.',
  'carrier network delay': 'Def: Delay in the carrier network before reaching delivery station. Action: Upstream issue - document and escalate. Track patterns by origin.',
  'late induct': 'Def: Package inducted after optimal window. Action: Review sort/induct staffing and scheduling. Ensure timely processing of all volume.',
  'late attempt': 'Def: Driver attempted delivery but after the promised window. Action: Review route density, stop count, and driver efficiency. Coach on time management.',
  'access issue': 'Def: Driver couldn\'t access delivery location (gate code, locked building, etc.). Action: Ensure access info is captured and available. Coach on using delivery notes.',
  'customer not available': 'Def: Customer wasn\'t present for delivery requiring signature/handoff. Action: Review if re-attempt was made. Check delivery window expectations.',
  'address issue': 'Def: Problem with delivery address (wrong, incomplete, hard to find). Action: Report to address quality team. Coach drivers on using map tools.',
  'carrier controllable issues': 'Def: Issues within carrier control that caused late delivery. Action: Deep dive specific controllable root cause and coach accordingly.',
  'carrier missort': 'Def: Package sorted to wrong station or route. Action: Review sort process, label clarity, and staging procedures.',
  'carrier vpm': 'Def: Vehicle/personnel/mechanical issue caused delay. Action: Review fleet maintenance schedule and backup driver availability.',
  'dea miss deep dive': 'Def: Delivery Exception Analysis miss requiring deeper investigation. Action: Pull full TBA history, review each scan point and timestamp.',
  'damaged and delivered': 'Def: Package was damaged but still delivered (late due to damage handling). Action: Review package handling at sort and on route.',
  'induct after mnr': 'Def: Package inducted after Mark Not Received cutoff. Action: Review inbound timing and induct process. May need volume balancing.',
  'items missing': 'Def: Items missing from shipment, causing delay in resolution. Action: Review handling chain, check for upstream losses.',
  'lost scan at amzl': 'Def: Package lost scan tracking within AMZL network. Action: Investigate last known location, review scan compliance.',
  'no free locker': 'Def: No available locker for package delivery. Action: Review locker utilization and alternative delivery options.',
  'not attempted on that day': 'Def: Package was assigned but driver did not attempt delivery. Action: Review route completion, identify if driver returned packages. Coach on attempt compliance.',
  'other': 'Def: Root cause doesn\'t fit standard categories. Action: Manual review needed - pull TBA details and investigate.',
};

// ============================================================
// PLATFORM CONFIG - drives column detection, titles, coaching
// ============================================================

const PLATFORM_CONFIGS = {
  concessions: {
    id: 'concessions',
    title: 'DSP Analytics Platform',
    subtitle: 'Advanced Hierarchical Pivot Table Analysis',
    accentColor: 'cyan',
    coachingTips: CONCESSION_COACHING,
    dspColumn: ['dsp'],
    subBucketColumn: ['sub bucket', 'sub_bucket', 'subbucket', 'bucket', 'defect type', 'defect_type', 'issue type', 'issue_type', 'reason', 'dnr reason'],
    transporterColumn: ['transporter id', 'transporter_id', 'transporterid', 'da id', 'da_id', 'driver id', 'driver_id'],
    costColumn: ['gross concession', 'concession usd', 'gross_concession', 'amount', 'usd', 'cost'],
    weekColumn: ['concession year week', 'year week', 'week', 'period'],
    tenureColumn: ['driver tenure', 'tenure', 'driver tenure weeks'],
    grossConcessionSearch: ['gross concession', 'concession usd', 'gross_concession', 'amount', 'usd'],
    podSearch: ['pod', 'photo on delivery', 'photo_on_delivery'],
    scanDistanceSearch: ['scan distance', 'scan_distance', 'distance'],
    concessionDateSearch: ['concession date', 'concession_date'],
    deliveryDateSearch: ['delivery date', 'delivery_date', 'actual delivery'],
    // extra columns used by One-Click preset views:
    trackingIdColumn: ['tracking id', 'tracking_id', 'trackingid', 'tracking'],
    propertyTypeColumn: ['property type', 'property_type', 'propertytype', 'address type', 'address_type', 'location type', 'dwelling type'],
    /*
     * PRESET VIEWS — the "One-Click Views" buttons.
     * Each entry builds a whole pivot in one click, then you can still tweak it.
     *   rowField / col : a config key above (e.g. 'transporterColumn') OR a literal
     *                    column name / list of names. It's resolved against the file.
     *   agg            : count | sum | average | min | max | value
     *   compareWeeks   : N  -> side-by-side of the N most recent weeks (latest first)
     *                    0/omit -> a normal (non-comparison) pivot
     *   filters        : [{ col, value }]  e.g. property type = House
     *   weekFilter     : 'highest' -> filter to the single most recent week
     *   threshold      : number -> sets the yellow highlight (blank = no highlight)
     * TO ADD YOUR OWN: copy any object below and change the fields.
     */
    presets: [
      { label: 'General View',
        rowField: 'transporterColumn',
        valueFields: [{ col: 'trackingIdColumn', agg: 'count' }],
        compareWeeks: 2, threshold: 3 },
      { label: 'House Delivery',
        rowField: 'subBucketColumn',
        valueFields: [{ col: 'trackingIdColumn', agg: 'count' }, { col: 'scanDistanceSearch', agg: 'average' }],
        compareWeeks: 2, filters: [{ col: 'propertyTypeColumn', value: 'House' }] },
      { label: 'Apartment Delivery',
        rowField: 'subBucketColumn',
        valueFields: [{ col: 'trackingIdColumn', agg: 'count' }, { col: 'scanDistanceSearch', agg: 'average' }],
        compareWeeks: 2, filters: [{ col: 'propertyTypeColumn', value: 'Apartment' }] },
      { label: 'House Delivery Misses',
        rowField: 'transporterColumn',
        valueFields: [{ col: 'trackingIdColumn', agg: 'value' }, { col: 'scanDistanceSearch', agg: 'sum' }],
        compareWeeks: 0, weekFilter: 'highest', filters: [{ col: 'propertyTypeColumn', value: 'House' }] },
    ],
  },
  lateDelivery: {
    id: 'lateDelivery',
    title: 'Late Delivery Deep Dive',
    subtitle: 'Root Cause Analysis & Coaching Platform',
    accentColor: 'orange',
    coachingTips: LATE_DELIVERY_COACHING,
    dspColumn: ['lt_attempt_pro_company_name', 'pro_company_name', 'dsp', 'company_name', 'company name'],
    subBucketColumn: ['concession_bucket_l3', 'bucket_l3', 'concession bucket l3', 'l3', 'concession_bucket_l2', 'bucket_l2', 'concession bucket l2', 'l2'],
    transporterColumn: ['lt_attempt_transporter_id', 'transporter_id', 'transporter id', 'driver id', 'driver_id'],
    costColumn: ['gross_cocnession_usd', 'gross_concession_usd', 'gross concession', 'concession_cost', 'concession cost', 'concession usd'],
    weekColumn: ['year_week', 'year week', 'week', 'period'],
    tenureColumn: ['driver_tenure_weeks', 'driver tenure weeks', 'driver_tenure_months', 'driver_tenure_days', 'tenure'],
    grossConcessionSearch: ['gross_cocnession_usd', 'gross_concession_usd', 'gross concession', 'concession_cost', 'concession cost'],
    podSearch: ['pod', 'photo on delivery'],
    scanDistanceSearch: ['scan distance', 'scan_distance'],
    concessionDateSearch: ['concession_creation_date', 'concession date', 'concession_date'],
    deliveryDateSearch: ['actual_delivery_date', 'actual delivery date', 'delivery date', 'delivery_date'],
    // extra columns used by One-Click preset views:
    trackingIdColumn: ['tracking id', 'tracking_id', 'trackingid', 'tracking'],
    propertyTypeColumn: ['property type', 'property_type', 'propertytype', 'lt_attempt_property_type', 'address type', 'address_type', 'location type'],
    // PRESET VIEWS — see the concessions config above for the full field guide.
    presets: [
      { label: 'General View',
        rowField: 'transporterColumn',
        valueFields: [{ col: 'trackingIdColumn', agg: 'count' }, { col: 'subBucketColumn', agg: 'value' }],
        compareWeeks: 2 },
    ],
  }
};


// ============================================================
// SHARED PIVOT TABLE PLATFORM COMPONENT
// ============================================================

function PivotPlatform({ config, onBack }) {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [selectedDSPs, setSelectedDSPs] = useState([]);
  const [pivotConfig, setPivotConfig] = useState({
    rowField: '',
    subRowField: '',
    valueFields: [{ field: '', aggregation: 'count', showActualValues: false }],
    filters: {},
    compareField: '',
    compareValues: []
  });
  const [pivotTables, setPivotTables] = useState([]);
  const [highlightConfig, setHighlightConfig] = useState({ condition: 'greater', value: '', color: 'yellow' });
  const [greenHighlightConfig, setGreenHighlightConfig] = useState({ condition: 'less', value: '', enabled: false });
  const [manualHighlights, setManualHighlights] = useState({});
  const [manualHighlightColor, setManualHighlightColor] = useState('orange');
  const [error, setError] = useState('');
  const [availableValues, setAvailableValues] = useState({});
  const [drillDownData, setDrillDownData] = useState(null);
  const [showDrillDown, setShowDrillDown] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [modalPosition, setModalPosition] = useState({ x: 50, y: 50 });
  const [modalSize, setModalSize] = useState({ width: 90, height: 85 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [expandedRows, setExpandedRows] = useState({});
  const [showManagerView, setShowManagerView] = useState(false);
  // One-Click preset views: which preset is active, and a flag to run it after state settles.
  const [activePreset, setActivePreset] = useState(null);
  const [presetToRun, setPresetToRun] = useState(false);

  /*
   * transporterNames: maps a normalized transporter ID -> DA/driver name.
   * Loaded from a SEPARATE names file at runtime and held only in state.
   * Works for BOTH platforms - it matches on the ID value itself, so it
   * doesn't matter whether the column is "transporter id" (concessions) or
   * "lt_attempt_transporter_id" (late delivery).
   */
  const [transporterNames, setTransporterNames] = useState({});
  const [namesLoadedCount, setNamesLoadedCount] = useState(0);

  const normalizeId = (id) => (id === null || id === undefined ? '' : id.toString().trim().toUpperCase());

  const getTransporterName = (id) => {
    const key = normalizeId(id);
    return key && transporterNames[key] ? transporterNames[key] : null;
  };

  const handleNamesUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      complete: (result) => {
        if (result.data && result.data.length > 0) {
          const cols = Object.keys(result.data[0]);
          const idCol =
            cols.find(c => c.toLowerCase().includes('transporter')) ||
            cols.find(c => c.toLowerCase().replace(/[^a-z]/g, '').includes('transporterid')) ||
            cols.find(c => c.toLowerCase() === 'id' || c.toLowerCase().endsWith(' id'));
          const nameCol =
            cols.find(c => c.toLowerCase().includes('name')) ||
            cols.find(c => {
              const l = c.toLowerCase();
              return l === 'da' || l.includes('driver') || l.includes('associate');
            });
          if (!idCol || !nameCol) {
            setError('Names file needs a Transporter ID column and a name column. Columns found: ' + cols.join(', '));
            return;
          }
          const map = {};
          result.data.forEach(row => {
            const key = normalizeId(row[idCol]);
            const name = row[nameCol];
            if (key && name !== null && name !== undefined && name.toString().trim() !== '') {
              map[key] = name.toString().trim();
            }
          });
          setTransporterNames(map);
          setNamesLoadedCount(Object.keys(map).length);
          setError('');
        }
      },
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true
    });
  };

  // Accent color classes
  const accent = config.accentColor;
  const accentText = `text-${accent}-400`;
  const accentBg = `bg-${accent}-600`;
  const accentBorder = `border-${accent}-500`;
  const accentGradient = accent === 'cyan' 
    ? 'from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700' 
    : 'from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700';

  // Helper to find column by name
  const findColumn = (searchTerms) => {
    for (const term of searchTerms) {
      const exactMatch = columns.find(col => col.toLowerCase() === term.toLowerCase());
      if (exactMatch) return exactMatch;
    }
    for (const term of searchTerms) {
      const partialMatch = columns.find(col => col.toLowerCase().includes(term.toLowerCase()));
      if (partialMatch) return partialMatch;
    }
    return null;
  };

  // File Upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      complete: (result) => {
        if (result.data && result.data.length > 0) {
          setData(result.data);
          const cols = Object.keys(result.data[0]);
          setColumns(cols);
          setVisibleColumns(cols);
          const values = {};
          cols.forEach(col => {
            values[col] = [...new Set(result.data.map(row => row[col]).filter(v => v !== null && v !== undefined && v !== ''))].sort();
          });
          setAvailableValues(values);
          setError('');
        }
      },
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true
    });
  };

  // DSP & Filter Management
  const toggleDSP = (dsp) => {
    setSelectedDSPs(prev => prev.includes(dsp) ? prev.filter(d => d !== dsp) : [...prev, dsp]);
  };
  const addFilter = (column) => {
    if (!pivotConfig.filters[column]) {
      setPivotConfig({ ...pivotConfig, filters: { ...pivotConfig.filters, [column]: '' } });
    }
  };
  const updateFilter = (column, value) => {
    setPivotConfig({ ...pivotConfig, filters: { ...pivotConfig.filters, [column]: value } });
  };
  const removeFilter = (column) => {
    const newFilters = { ...pivotConfig.filters };
    delete newFilters[column];
    setPivotConfig({ ...pivotConfig, filters: newFilters });
  };
  const toggleCompareValue = (value) => {
    const current = pivotConfig.compareValues;
    setPivotConfig({
      ...pivotConfig,
      compareValues: current.includes(value) ? current.filter(v => v !== value) : [...current, value]
    });
  };

  // Value Field Management
  const addValueField = () => {
    setPivotConfig({
      ...pivotConfig,
      valueFields: [...pivotConfig.valueFields, { field: '', aggregation: 'count', showActualValues: false }]
    });
  };
  const updateValueField = (index, field, value) => {
    const newValueFields = [...pivotConfig.valueFields];
    newValueFields[index][field] = value;
    setPivotConfig({ ...pivotConfig, valueFields: newValueFields });
  };
  const removeValueField = (index) => {
    if (pivotConfig.valueFields.length > 1) {
      setPivotConfig({ ...pivotConfig, valueFields: pivotConfig.valueFields.filter((_, i) => i !== index) });
    }
  };

  // Aggregation
  const calculateAggregation = (data, field, aggregation) => {
    const values = data.map(row => row[field]).filter(v => v !== null && v !== undefined && v !== '');
    if (aggregation === 'count') return values.length;
    if (aggregation === 'value') {
      if (values.length === 1) return values[0];
      return values.join(', ');
    }
    const numValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (numValues.length === 0) return 0;
    switch (aggregation) {
      case 'sum': return _.sum(numValues);
      case 'average': return _.mean(numValues);
      case 'min': return _.min(numValues);
      case 'max': return _.max(numValues);
      default: return 0;
    }
  };

  // Create Pivot Tables
  const createPivotTables = () => {
    if (!pivotConfig.rowField) { setError('Please select a Row Field'); return; }
    const hasValidValueField = pivotConfig.valueFields.some(vf => vf.field !== '');
    if (!hasValidValueField) { setError('Please select at least one Value Field'); return; }
    if (selectedDSPs.length === 0) { setError('Please select at least one DSP'); return; }

    try {
      const dspCol = findColumn(config.dspColumn);
      const pivotResults = [];

      selectedDSPs.forEach(dsp => {
        let filteredData = data.filter(row => {
          if (!dspCol || row[dspCol] !== dsp) return false;
          for (let filterCol in pivotConfig.filters) {
            const filterValue = pivotConfig.filters[filterCol];
            if (filterValue && row[filterCol] !== filterValue) return false;
          }
          return true;
        });
        if (filteredData.length === 0) return;

        if (pivotConfig.subRowField) {
          const grouped = _.groupBy(filteredData, row => row[pivotConfig.rowField] || 'Unknown');
          const hierarchicalData = {};
          Object.keys(grouped).forEach(parentKey => {
            const parentGroupData = grouped[parentKey];
            const childGroups = _.groupBy(parentGroupData, row => row[pivotConfig.subRowField] || 'Unknown');
            hierarchicalData[parentKey] = { values: {}, rawData: parentGroupData, children: {} };
            pivotConfig.valueFields.forEach((vf, index) => {
              if (vf.field) hierarchicalData[parentKey].values[`value_${index}`] = calculateAggregation(parentGroupData, vf.field, vf.aggregation);
            });
            Object.keys(childGroups).forEach(childKey => {
              const childGroupData = childGroups[childKey];
              hierarchicalData[parentKey].children[childKey] = { values: {}, rawData: childGroupData };
              pivotConfig.valueFields.forEach((vf, index) => {
                if (vf.field) hierarchicalData[parentKey].children[childKey].values[`value_${index}`] = calculateAggregation(childGroupData, vf.field, vf.aggregation);
              });
            });
          });
          pivotResults.push({ dsp, data: hierarchicalData, isHierarchical: true, isComparison: false });
        } else if (pivotConfig.compareField && pivotConfig.compareValues.length > 0) {
          const allRowKeys = new Set();
          const compareData = {};
          pivotConfig.compareValues.forEach(compareVal => {
            let compFilteredData = filteredData.filter(row => row[pivotConfig.compareField] === compareVal);
            const grouped = _.groupBy(compFilteredData, row => row[pivotConfig.rowField] || 'Unknown');
            compareData[compareVal] = {};
            Object.keys(grouped).forEach(rowKey => {
              allRowKeys.add(rowKey);
              const groupData = grouped[rowKey];
              compareData[compareVal][rowKey] = { values: {}, rawData: groupData };
              pivotConfig.valueFields.forEach((vf, index) => {
                if (vf.field) compareData[compareVal][rowKey].values[`value_${index}`] = calculateAggregation(groupData, vf.field, vf.aggregation);
              });
            });
          });
          pivotResults.push({ dsp, data: compareData, rowKeys: Array.from(allRowKeys), isComparison: true, isHierarchical: false });
        } else {
          const grouped = _.groupBy(filteredData, row => row[pivotConfig.rowField] || 'Unknown');
          const pivotData = {};
          Object.keys(grouped).forEach(rowKey => {
            const groupData = grouped[rowKey];
            pivotData[rowKey] = { values: {}, rawData: groupData };
            pivotConfig.valueFields.forEach((vf, index) => {
              if (vf.field) pivotData[rowKey].values[`value_${index}`] = calculateAggregation(groupData, vf.field, vf.aggregation);
            });
          });
          pivotResults.push({ dsp, data: pivotData, isComparison: false, isHierarchical: false });
        }
      });

      if (pivotResults.every(p => Object.keys(p.data).length === 0)) {
        setError('No data found matching the selected filters');
        return;
      }
      setPivotTables(pivotResults);
      setManualHighlights({});
      setExpandedRows({});
      setError('');
    } catch (err) {
      setError('Error creating pivot tables: ' + err.message);
    }
  };

  // ============================================================
  // ONE-CLICK PRESET VIEWS
  // Builds a full pivot (row field, value fields, comparison, filters,
  // threshold) from a preset object, then generates it. Manual controls are
  // untouched — a preset just fills them in for you.
  // ============================================================

  // Resolve a preset's column spec to a real column in the loaded file.
  // spec can be a config key ('transporterColumn'), a literal name, or a list.
  const resolvePresetCol = (spec) => {
    if (!spec) return null;
    if (Array.isArray(spec)) return findColumn(spec);
    if (typeof spec === 'string') {
      if (config[spec]) return findColumn(config[spec]);   // it's a config key
      return findColumn([spec]);                            // it's a literal column name
    }
    return null;
  };

  // Weeks, most-recent first. Handles "2025-35", "35", "Wk 34", etc.
  const weeksDescending = (weekCol) => {
    const vals = (availableValues[weekCol] || []).slice();
    vals.sort((a, b) => {
      const na = parseInt(String(a).replace(/\D/g, ''), 10);
      const nb = parseInt(String(b).replace(/\D/g, ''), 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return nb - na;
      return String(b).localeCompare(String(a));
    });
    return vals;
  };

  // Match a target filter value (e.g. "House") to the file's actual value,
  // case-insensitively, so casing differences still filter correctly.
  const resolvePresetValue = (col, target) => {
    const vals = availableValues[col] || [];
    const exact = vals.find(v => String(v).toLowerCase() === String(target).toLowerCase());
    if (exact !== undefined) return exact;
    const partial = vals.find(v => String(v).toLowerCase().includes(String(target).toLowerCase()));
    return partial !== undefined ? partial : target;
  };

  const applyPreset = (preset) => {
    if (data.length === 0) { setError('Load a file first, then pick a view.'); return; }

    const rowField = resolvePresetCol(preset.rowField);
    if (!rowField) {
      const want = Array.isArray(preset.rowField) ? preset.rowField[0] : preset.rowField;
      setError(`"${preset.label}" needs a ${want} column, which isn't in this file.`);
      return;
    }

    // Value fields (skip any whose column isn't in the file).
    const valueFields = [];
    (preset.valueFields || []).forEach(vf => {
      const f = resolvePresetCol(vf.col);
      if (f) valueFields.push({ field: f, aggregation: vf.agg || 'count', showActualValues: vf.agg === 'value' });
    });
    if (valueFields.length === 0) valueFields.push({ field: '', aggregation: 'count', showActualValues: false });

    // Filters (e.g. property type = House).
    const filters = {};
    (preset.filters || []).forEach(fl => {
      const c = resolvePresetCol(fl.col);
      if (c) filters[c] = resolvePresetValue(c, fl.value);
    });

    // Week comparison (side-by-side) and/or single-week filter.
    const weekCol = resolvePresetCol('weekColumn');
    let compareField = '', compareValues = [];
    if (preset.compareWeeks && weekCol) {
      compareValues = weeksDescending(weekCol).slice(0, preset.compareWeeks); // [latest, previous, ...]
      compareField = compareValues.length ? weekCol : '';
    }
    if (preset.weekFilter === 'highest' && weekCol) {
      const weeks = weeksDescending(weekCol);
      if (weeks.length) filters[weekCol] = weeks[0];
    }

    setPivotConfig(prev => ({ ...prev, rowField, subRowField: '', valueFields, filters, compareField, compareValues }));

    // Threshold / highlight (General View sets 3; others clear it).
    if (preset.threshold !== undefined && preset.threshold !== null) {
      setHighlightConfig({ condition: 'greater', value: String(preset.threshold), color: 'yellow' });
    } else {
      setHighlightConfig(prev => ({ ...prev, value: '' }));
    }

    // Truly one-click: if no DSP is chosen yet, select all so it renders immediately.
    if (selectedDSPs.length === 0 && dspCol && availableValues[dspCol]) {
      setSelectedDSPs(availableValues[dspCol]);
    }

    setActivePreset(preset.label);
    setError('');
    setPresetToRun(true);   // the effect below runs createPivotTables once state has updated
  };

  // Run the pivot AFTER the preset's state changes are applied (so createPivotTables
  // sees the new config), then reset the flag.
  useEffect(() => {
    if (presetToRun) {
      createPivotTables();
      setPresetToRun(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetToRun, pivotConfig, selectedDSPs, highlightConfig]);


  // Highlighting
  const shouldHighlightYellow = (value) => {
    if (!highlightConfig.value || highlightConfig.value === '') return false;
    const numValue = parseFloat(value);
    const threshold = parseFloat(highlightConfig.value);
    if (isNaN(numValue) || isNaN(threshold)) return false;
    switch (highlightConfig.condition) {
      case 'greater': return numValue > threshold;
      case 'less': return numValue < threshold;
      case 'equal': return numValue === threshold;
      default: return false;
    }
  };
  const shouldHighlightGreen = (value) => {
    if (!greenHighlightConfig.enabled || !greenHighlightConfig.value || greenHighlightConfig.value === '') return false;
    const numValue = parseFloat(value);
    const threshold = parseFloat(greenHighlightConfig.value);
    if (isNaN(numValue) || isNaN(threshold)) return false;
    switch (greenHighlightConfig.condition) {
      case 'greater': return numValue > threshold;
      case 'less': return numValue < threshold;
      case 'equal': return numValue === threshold;
      default: return false;
    }
  };
  const toggleManualHighlight = (cellId, e) => {
    e.preventDefault();
    e.stopPropagation();
    setManualHighlights(prev => {
      const currentColor = prev[cellId];
      let newColor;
      if (manualHighlightColor === 'cycle') {
        if (!currentColor) newColor = 'orange';
        else if (currentColor === 'orange') newColor = 'green';
        else newColor = null;
      } else {
        newColor = currentColor === manualHighlightColor ? null : manualHighlightColor;
      }
      return { ...prev, [cellId]: newColor };
    });
  };
  const getAggregationLabel = (agg) => {
    const labels = { count: 'Count', sum: 'Sum', average: 'Avg', min: 'Min', max: 'Max', value: 'Value' };
    return labels[agg] || 'Value';
  };
  const getHighlightClass = (value, cellId) => {
    const manualColor = manualHighlights[cellId];
    if (manualColor === 'orange') return 'bg-amber-500 text-black font-bold';
    if (manualColor === 'green') return 'bg-green-500 text-black font-bold';
    if (shouldHighlightGreen(value)) return 'bg-green-400 text-black font-bold';
    if (shouldHighlightYellow(value)) return 'bg-yellow-400 text-black font-bold';
    return '';
  };
  const getRowLabelHighlightClass = (cellId) => {
    const manualColor = manualHighlights[cellId];
    if (manualColor === 'orange') return 'bg-amber-500 text-black';
    if (manualColor === 'green') return 'bg-green-500 text-black';
    return '';
  };

  // Coaching tip lookup
  const getCoachingTip = (bucket) => {
    if (!bucket) return 'Review with driver for root cause.';
    const bucketLower = bucket.toLowerCase();
    for (const [key, tip] of Object.entries(config.coachingTips)) {
      if (bucketLower.includes(key) || key.includes(bucketLower)) return tip;
    }
    return 'Review with driver for root cause.';
  };

  // Sub bucket analysis
  const analyzeSubBuckets = (rawDataArray) => {
    if (!rawDataArray || rawDataArray.length === 0) return [];
    const subBucketCol = findColumn(config.subBucketColumn);
    if (!subBucketCol) return [];
    const bucketCounts = {};
    rawDataArray.forEach(row => {
      const bucket = row[subBucketCol];
      if (bucket && bucket.toString().trim()) {
        const key = bucket.toString().trim();
        bucketCounts[key] = (bucketCounts[key] || 0) + 1;
      }
    });
    const sortedBuckets = Object.entries(bucketCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const tips = [];
    sortedBuckets.forEach(([bucket, count]) => {
      const bucketLower = bucket.toLowerCase();
      let found = false;
      for (const [key, tip] of Object.entries(config.coachingTips)) {
        if (bucketLower.includes(key) || key.includes(bucketLower)) {
          tips.push({ bucket, count, tip });
          found = true;
          break;
        }
      }
      if (!found) tips.push({ bucket, count, tip: null });
    });
    return tips;
  };

  // Summary statement generator
  const generateSummaryStatement = (pivot) => {
    const valueField = pivotConfig.valueFields[0];
    if (!valueField || !valueField.field) return '';
    const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    const grossConcessionCol = findColumn(config.grossConcessionSearch);
    const podCol = findColumn(config.podSearch);
    const scanDistanceCol = findColumn(config.scanDistanceSearch);
    const concessionDateCol = findColumn(config.concessionDateSearch);
    const deliveryDateCol = findColumn(config.deliveryDateSearch);

    const calculateMetrics = (rawDataArray) => {
      if (!rawDataArray || rawDataArray.length === 0) return null;
      const metrics = { count: rawDataArray.length };
      if (grossConcessionCol) {
        const values = rawDataArray.map(r => parseFloat(r[grossConcessionCol])).filter(v => !isNaN(v));
        metrics.totalConcession = values.reduce((sum, v) => sum + v, 0);
      }
      if (podCol) {
        const podValues = rawDataArray.map(r => r[podCol]).filter(v => v !== null && v !== undefined && v !== '');
        const withPod = podValues.filter(v => ['yes','true','1','y'].includes(v.toString().toLowerCase())).length;
        metrics.podRate = podValues.length > 0 ? (withPod / podValues.length * 100) : 0;
        metrics.podCount = withPod;
        metrics.noPodCount = podValues.length - withPod;
      }
      if (scanDistanceCol) {
        const distances = rawDataArray.map(r => parseFloat(r[scanDistanceCol])).filter(v => !isNaN(v));
        metrics.avgScanDistance = distances.length > 0 ? distances.reduce((sum, v) => sum + v, 0) / distances.length : 0;
      }
      if (concessionDateCol) {
        const dates = rawDataArray.map(r => r[concessionDateCol]).filter(v => v).sort();
        if (dates.length > 0) metrics.dateRange = { start: dates[0], end: dates[dates.length - 1] };
      }
      if (deliveryDateCol) {
        const deliveryDates = rawDataArray.map(r => r[deliveryDateCol]).filter(v => v).sort();
        if (deliveryDates.length > 0) metrics.deliveryDateRange = { start: deliveryDates[0], end: deliveryDates[deliveryDates.length - 1] };
      }
      return metrics;
    };

    if (pivot.isComparison && pivotConfig.compareValues.length >= 2) {
      const periods = pivotConfig.compareValues;
      const periodData = {};
      periods.forEach(period => {
        const pdata = pivot.data[period];
        if (!pdata) return;
        const allRawData = Object.values(pdata).flatMap(d => d.rawData || []);
        const sorted = Object.keys(pdata).map(key => ({ name: key, value: pdata[key].values?.value_0 || 0, rawData: pdata[key].rawData })).sort((a, b) => b.value - a.value);
        periodData[period] = {
          total: sorted.reduce((sum, r) => sum + r.value, 0),
          count: Object.keys(pdata).length,
          topOffenders: sorted.slice(0, 3),
          allOffenders: sorted.map(s => s.name),
          metrics: calculateMetrics(allRawData)
        };
      });
      const [period1, period2] = periods;
      const data1 = periodData[period1], data2 = periodData[period2];
      if (!data1 || !data2) return '';
      const repeatOffenders = data1.allOffenders.filter(name => data2.allOffenders.includes(name));
      const topRepeatOffenders = repeatOffenders.filter(name => data1.topOffenders.some(t => t.name === name) || data2.topOffenders.some(t => t.name === name)).slice(0, 5);
      const diff = data1.total - data2.total;
      const percentChange = data2.total > 0 ? ((diff / data2.total) * 100).toFixed(1) : 0;
      const improved = diff < 0;
      let statement = '';
      if (improved) statement = `📈 Great improvement! Your team saw a ${Math.abs(percentChange)}% reduction from ${period2} to ${period1}. `;
      else if (diff > 0) statement = `📉 Attention needed: Your team saw a ${Math.abs(percentChange)}% increase from ${period2} to ${period1}. `;
      else statement = `➡️ Performance remained steady between ${period2} and ${period1}. `;
      const topNames = data1.topOffenders.slice(0, 3).map(t => t.name).join(', ');
      statement += `Top offenders in ${period1}: ${topNames}. `;
      if (topRepeatOffenders.length > 0) statement += `\n⚠️ Repeat offenders (appear in both ${period1} and ${period2}): ${topRepeatOffenders.join(', ')}. `;
      else if (repeatOffenders.length > 0) statement += `\n⚠️ ${repeatOffenders.length} ${pivotConfig.rowField}(s) appear in both periods. `;
      if (data1.metrics?.totalConcession !== undefined) {
        const concessionDiff = (data1.metrics.totalConcession || 0) - (data2.metrics?.totalConcession || 0);
        statement += `Total concession cost: ${formatCurrency(data1.metrics.totalConcession)}`;
        if (concessionDiff !== 0) statement += ` (${concessionDiff < 0 ? '↓' : '↑'}${formatCurrency(Math.abs(concessionDiff))} vs ${period2})`;
        statement += '. ';
      }
      if (data1.metrics?.podRate !== undefined) statement += `POD rate: ${data1.metrics.podRate.toFixed(1)}% (${data1.metrics.noPodCount} missing POD). `;
      if (data1.metrics?.avgScanDistance !== undefined) statement += `Avg scan distance: ${data1.metrics.avgScanDistance.toFixed(1)}m. `;
      if (data1.metrics?.dateRange) statement += `\n📅 Concessions placed: ${data1.metrics.dateRange.start} to ${data1.metrics.dateRange.end}.`;
      if (data1.metrics?.deliveryDateRange) statement += ` Actual deliveries: ${data1.metrics.deliveryDateRange.start} to ${data1.metrics.deliveryDateRange.end}.`;
      const allRawData1 = Object.values(pivot.data[period1] || {}).flatMap(d => d.rawData || []);
      const coachingTips = analyzeSubBuckets(allRawData1);
      if (coachingTips.length > 0) {
        statement += `\n\n🔧 Coaching Focus Areas:`;
        coachingTips.forEach(({ bucket, count, tip }) => { statement += `\n• ${bucket} (${count}): ${tip || 'Review with driver for root cause.'}`; });
      }
      return statement;
    } else {
      const allData = pivot.data;
      const allRawData = Object.values(allData).flatMap(d => d.rawData || []);
      const metrics = calculateMetrics(allRawData);
      let numericValueIndex = -1;
      for (let i = 0; i < pivotConfig.valueFields.length; i++) {
        if (pivotConfig.valueFields[i].field && pivotConfig.valueFields[i].aggregation !== 'value') { numericValueIndex = i; break; }
      }
      const sorted = Object.keys(allData).map(key => {
        let numValue = numericValueIndex >= 0 ? (allData[key].values?.[`value_${numericValueIndex}`] || 0) : (allData[key].rawData?.length || 0);
        return { name: key, value: typeof numValue === 'number' ? numValue : 0, recordCount: allData[key].rawData?.length || 0 };
      }).sort((a, b) => b.value - a.value);
      const topThree = sorted.slice(0, 3);
      const total = sorted.reduce((sum, r) => sum + r.value, 0);
      const topThreeTotal = topThree.reduce((sum, r) => sum + r.value, 0);
      const topThreePercent = total > 0 ? ((topThreeTotal / total) * 100).toFixed(1) : 0;
      let statement = `📊 Overview: ${sorted.length} ${pivotConfig.rowField}(s) found. `;
      if (numericValueIndex >= 0 && total > 0) {
        const numericField = pivotConfig.valueFields[numericValueIndex];
        const topNames = topThree.map(t => `${t.name} (${t.value.toFixed(2)})`).join(', ');
        statement += `Top offenders: ${topNames} — accounting for ${topThreePercent}% of total ${getAggregationLabel(numericField.aggregation).toLowerCase()}. `;
      } else {
        const topNames = topThree.map(t => `${t.name} (${t.recordCount} records)`).join(', ');
        statement += `Top ${pivotConfig.rowField}s: ${topNames}. `;
      }
      if (metrics?.totalConcession !== undefined) statement += `Total concession cost: ${formatCurrency(metrics.totalConcession)}. `;
      if (metrics?.podRate !== undefined) statement += `POD rate: ${metrics.podRate.toFixed(1)}% (${metrics.noPodCount} deliveries missing POD). `;
      if (metrics?.avgScanDistance !== undefined) statement += `Avg scan distance: ${metrics.avgScanDistance.toFixed(1)} meters. `;
      if (metrics?.dateRange) statement += `\n📅 Concessions placed: ${metrics.dateRange.start} to ${metrics.dateRange.end}.`;
      if (metrics?.deliveryDateRange) statement += ` Actual deliveries: ${metrics.deliveryDateRange.start} to ${metrics.deliveryDateRange.end}.`;
      const coachingTips = analyzeSubBuckets(allRawData);
      if (coachingTips.length > 0) {
        statement += `\n\n🔧 Coaching Focus Areas:`;
        coachingTips.forEach(({ bucket, count, tip }) => { statement += `\n• ${bucket} (${count}): ${tip || 'Review with driver for root cause.'}`; });
      }
      return statement;
    }
  };

  // Manager View Data
  const generateManagerViewData = () => {
    if (!data || data.length === 0) return null;
    const subBucketCol = findColumn(config.subBucketColumn);
    const dspCol = findColumn(config.dspColumn);
    const transporterCol = findColumn(config.transporterColumn);
    const concessionCol = findColumn(config.costColumn);
    const weekCol = findColumn(config.weekColumn);
    const tenureCol = findColumn(config.tenureColumn);

    // Sub Bucket Analysis
    const subBucketCounts = {}, subBucketCosts = {};
    data.forEach(row => {
      if (subBucketCol) {
        const bucket = row[subBucketCol];
        if (bucket && bucket.toString().trim()) {
          const key = bucket.toString().trim();
          subBucketCounts[key] = (subBucketCounts[key] || 0) + 1;
          if (concessionCol) subBucketCosts[key] = (subBucketCosts[key] || 0) + (parseFloat(row[concessionCol]) || 0);
        }
      }
    });
    const subBucketAnalysis = Object.entries(subBucketCounts).map(([bucket, count]) => ({
      bucket, count, cost: subBucketCosts[bucket] || 0, percentage: ((count / data.length) * 100).toFixed(1), tip: getCoachingTip(bucket)
    })).sort((a, b) => b.count - a.count);
    const costAnalysis = [...subBucketAnalysis].filter(item => item.cost > 0).sort((a, b) => b.cost - a.cost);

    // Driver Analysis
    const driverCounts = {}, driverCosts = {}, driverDSPs = {};
    data.forEach(row => {
      if (transporterCol) {
        const driver = row[transporterCol];
        if (driver && driver.toString().trim()) {
          const key = driver.toString().trim();
          driverCounts[key] = (driverCounts[key] || 0) + 1;
          if (concessionCol) driverCosts[key] = (driverCosts[key] || 0) + (parseFloat(row[concessionCol]) || 0);
          if (dspCol && row[dspCol]) driverDSPs[key] = row[dspCol];
        }
      }
    });
    const driverAnalysis = Object.entries(driverCounts).map(([driver, count]) => ({
      driver, count, cost: driverCosts[driver] || 0, dsp: driverDSPs[driver] || 'Unknown', percentage: ((count / data.length) * 100).toFixed(1)
    })).sort((a, b) => b.count - a.count).slice(0, 20);

    // DSP Analysis
    const dspCounts = {}, dspCosts = {};
    data.forEach(row => {
      if (dspCol) {
        const dsp = row[dspCol];
        if (dsp && dsp.toString().trim()) {
          const key = dsp.toString().trim();
          dspCounts[key] = (dspCounts[key] || 0) + 1;
          if (concessionCol) dspCosts[key] = (dspCosts[key] || 0) + (parseFloat(row[concessionCol]) || 0);
        }
      }
    });
    const dspAnalysis = Object.entries(dspCounts).map(([dsp, count]) => ({
      dsp, count, cost: dspCosts[dsp] || 0, percentage: ((count / data.length) * 100).toFixed(1)
    })).sort((a, b) => b.count - a.count);

    // Week Trends
    let weekTrends = [];
    if (weekCol) {
      const weekCounts = {}, weekCosts = {};
      data.forEach(row => {
        const week = row[weekCol];
        if (week && week.toString().trim()) {
          const key = week.toString().trim();
          weekCounts[key] = (weekCounts[key] || 0) + 1;
          if (concessionCol) weekCosts[key] = (weekCosts[key] || 0) + (parseFloat(row[concessionCol]) || 0);
        }
      });
      weekTrends = Object.entries(weekCounts).map(([week, count]) => ({ week, count, cost: weekCosts[week] || 0 })).sort((a, b) => a.week.localeCompare(b.week));
    }

    // Tenure Analysis
    let tenureAnalysis = [];
    if (tenureCol) {
      const tenureCounts = {}, tenureCosts = {};
      data.forEach(row => {
        const tenure = row[tenureCol];
        if (tenure !== null && tenure !== undefined && tenure !== '') {
          const tenureNum = parseFloat(tenure);
          let tenureGroup;
          if (isNaN(tenureNum)) tenureGroup = tenure.toString().trim();
          else if (tenureNum >= 10) tenureGroup = 'Week 10+';
          else if (tenureNum >= 5) tenureGroup = 'Week 5-9';
          else if (tenureNum >= 1) tenureGroup = 'Week 1-4';
          else tenureGroup = 'Week 0 (New)';
          tenureCounts[tenureGroup] = (tenureCounts[tenureGroup] || 0) + 1;
          if (concessionCol) tenureCosts[tenureGroup] = (tenureCosts[tenureGroup] || 0) + (parseFloat(row[concessionCol]) || 0);
        }
      });
      const totalForPercent = Object.values(tenureCounts).reduce((sum, c) => sum + c, 0);
      tenureAnalysis = Object.entries(tenureCounts).map(([tenure, count]) => ({
        tenure, count, cost: tenureCosts[tenure] || 0, percentage: totalForPercent > 0 ? ((count / totalForPercent) * 100).toFixed(1) : 0
      })).sort((a, b) => b.count - a.count);
    }

    // Station Analysis (for Late Delivery platform)
    let stationAnalysis = [];
    const stationCol = findColumn(['delivery_station_code', 'station_code', 'station code', 'station']);
    if (stationCol) {
      const stationCounts = {}, stationCosts = {};
      data.forEach(row => {
        const station = row[stationCol];
        if (station && station.toString().trim()) {
          const key = station.toString().trim();
          stationCounts[key] = (stationCounts[key] || 0) + 1;
          if (concessionCol) stationCosts[key] = (stationCosts[key] || 0) + (parseFloat(row[concessionCol]) || 0);
        }
      });
      stationAnalysis = Object.entries(stationCounts).map(([station, count]) => ({
        station, count, cost: stationCosts[station] || 0, percentage: ((count / data.length) * 100).toFixed(1)
      })).sort((a, b) => b.count - a.count);
    }

    // L2 Bucket Analysis (for Late Delivery)
    let l2Analysis = [];
    const l2Col = findColumn(['concession_bucket_l2', 'bucket_l2', 'concession bucket l2']);
    if (l2Col) {
      const l2Counts = {}, l2Costs = {};
      data.forEach(row => {
        const l2 = row[l2Col];
        if (l2 && l2.toString().trim()) {
          const key = l2.toString().trim();
          l2Counts[key] = (l2Counts[key] || 0) + 1;
          if (concessionCol) l2Costs[key] = (l2Costs[key] || 0) + (parseFloat(row[concessionCol]) || 0);
        }
      });
      l2Analysis = Object.entries(l2Counts).map(([bucket, count]) => ({
        bucket, count, cost: l2Costs[bucket] || 0, percentage: ((count / data.length) * 100).toFixed(1)
      })).sort((a, b) => b.count - a.count);
    }

    // Summary
    const validData = data.filter(row => Object.values(row).some(val => val !== null && val !== undefined && val !== ''));
    const totalConcessions = validData.length;
    const totalCost = concessionCol ? validData.reduce((sum, row) => sum + (parseFloat(row[concessionCol]) || 0), 0) : 0;
    const uniqueDrivers = transporterCol ? new Set(validData.map(row => row[transporterCol]).filter(v => v)).size : 0;
    const uniqueDSPs = dspCol ? new Set(validData.map(row => row[dspCol]).filter(v => v)).size : 0;
    const weeksFound = weekCol ? [...new Set(validData.map(row => row[weekCol]).filter(v => v))].sort() : [];

    return {
      subBucketAnalysis, costAnalysis, driverAnalysis, dspAnalysis, weekTrends, tenureAnalysis, stationAnalysis, l2Analysis,
      summary: { totalConcessions, totalCost, uniqueDrivers, uniqueDSPs, avgCostPerConcession: totalConcessions > 0 ? totalCost / totalConcessions : 0, weeksFound, rawRowCount: data.length },
      columns: {
        hasSubBucket: !!subBucketCol, subBucketColName: subBucketCol || 'Not found',
        hasCost: !!concessionCol, costColName: concessionCol || 'Not found',
        hasDriver: !!transporterCol, driverColName: transporterCol || 'Not found',
        hasDSP: !!dspCol, dspColName: dspCol || 'Not found',
        hasWeek: !!weekCol, weekColName: weekCol || 'Not found',
        hasTenure: !!tenureCol, tenureColName: tenureCol || 'Not found',
        hasStation: !!stationCol, stationColName: stationCol || 'Not found',
        hasL2: !!l2Col, l2ColName: l2Col || 'Not found',
      }
    };
  };

  // Row Expansion
  const toggleRowExpansion = (rowKey) => {
    setExpandedRows(prev => ({ ...prev, [rowKey]: !prev[rowKey] }));
  };

  // Drill-Down
  const handleDrillDown = (rawData, rowKey, dsp, compareValue = null) => {
    setDrillDownData({ data: rawData, rowKey, dsp, compareValue });
    setShowDrillDown(true);
  };
  const closeDrillDown = () => {
    setShowDrillDown(false);
    setDrillDownData(null);
    setModalPosition({ x: 50, y: 50 });
    setModalSize({ width: 90, height: 85 });
  };
  const handleMouseDown = (e) => {
    if (e.target.closest('.modal-header')) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - (modalPosition.x * window.innerWidth / 100), y: e.clientY - (modalPosition.y * window.innerHeight / 100) });
    }
  };
  const handleMouseMove = (e) => {
    if (isDragging) {
      const newX = ((e.clientX - dragStart.x) / window.innerWidth) * 100;
      const newY = ((e.clientY - dragStart.y) / window.innerHeight) * 100;
      setModalPosition({ x: Math.max(0, Math.min(100 - modalSize.width, newX)), y: Math.max(0, Math.min(100 - modalSize.height, newY)) });
    }
    if (isResizing) {
      const newWidth = ((e.clientX - dragStart.x) / window.innerWidth) * 100;
      const newHeight = ((e.clientY - dragStart.y) / window.innerHeight) * 100;
      setModalSize({ width: Math.max(40, Math.min(100, newWidth)), height: Math.max(30, Math.min(100, newHeight)) });
    }
  };
  const handleMouseUp = () => { setIsDragging(false); setIsResizing(false); };
  const handleResizeMouseDown = (e) => {
    e.stopPropagation();
    setIsResizing(true);
    setDragStart({ x: e.clientX - (modalSize.width * window.innerWidth / 100), y: e.clientY - (modalSize.height * window.innerHeight / 100) });
  };
  const maximizeModal = () => { setModalPosition({ x: 0, y: 0 }); setModalSize({ width: 100, height: 100 }); };
  const resetModalSize = () => { setModalPosition({ x: 50, y: 50 }); setModalSize({ width: 90, height: 85 }); };

  const handleSubBucketDrillDown = (subBucket) => {
    const subBucketCol = findColumn(config.subBucketColumn);
    if (!subBucketCol) return;
    const filteredData = data.filter(row => row[subBucketCol] && row[subBucketCol].toString().trim() === subBucket);
    setModalPosition({ x: 5, y: 5 });
    setModalSize({ width: 90, height: 85 });
    setDrillDownData({ data: filteredData, rowKey: subBucket, dsp: 'All DSPs', compareValue: null });
    setShowDrillDown(true);
  };

  const toggleColumnVisibility = (column) => {
    setVisibleColumns(prev => prev.includes(column) ? prev.filter(c => c !== column) : [...prev, column]);
  };

  // CSV Download
  const downloadCSV = (dataToExport, filename) => {
    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const downloadPivotTable = (pivot) => {
    const exportData = [];
    if (pivot.isHierarchical) {
      const sortedParentKeys = Object.keys(pivot.data).sort((a, b) => (pivot.data[b].values.value_0 || 0) - (pivot.data[a].values.value_0 || 0));
      sortedParentKeys.forEach(parentKey => {
        const parentRow = { [pivotConfig.rowField]: parentKey };
        pivotConfig.valueFields.forEach((vf, vfIndex) => {
          if (vf.field) {
            const value = pivot.data[parentKey].values[`value_${vfIndex}`];
            parentRow[`${getAggregationLabel(vf.aggregation)} of ${vf.field}`] = vf.aggregation === 'count' || vf.aggregation === 'value' ? value : (typeof value === 'number' ? parseFloat(value.toFixed(4)) : value);
          }
        });
        exportData.push(parentRow);
        const children = pivot.data[parentKey].children;
        Object.keys(children).sort((a, b) => (children[b].values.value_0 || 0) - (children[a].values.value_0 || 0)).forEach(childKey => {
          const childRow = { [pivotConfig.rowField]: `  ${childKey}` };
          pivotConfig.valueFields.forEach((vf, vfIndex) => {
            if (vf.field) {
              const value = children[childKey].values[`value_${vfIndex}`];
              childRow[`${getAggregationLabel(vf.aggregation)} of ${vf.field}`] = vf.aggregation === 'count' || vf.aggregation === 'value' ? value : (typeof value === 'number' ? parseFloat(value.toFixed(4)) : value);
            }
          });
          exportData.push(childRow);
        });
      });
    } else {
      Object.keys(pivot.data).sort((a, b) => (pivot.data[b].values?.value_0 || 0) - (pivot.data[a].values?.value_0 || 0)).forEach(rowKey => {
        const row = { [pivotConfig.rowField]: rowKey };
        pivotConfig.valueFields.forEach((vf, vfIndex) => {
          if (vf.field) {
            const value = pivot.data[rowKey].values[`value_${vfIndex}`];
            row[`${getAggregationLabel(vf.aggregation)} of ${vf.field}`] = vf.aggregation === 'count' || vf.aggregation === 'value' ? value : (typeof value === 'number' ? parseFloat(value.toFixed(4)) : value);
          }
        });
        exportData.push(row);
      });
    }
    downloadCSV(exportData, `${pivot.dsp}_pivot.csv`);
  };
  const downloadDrillDownData = () => {
    if (!drillDownData) return;
    const exportData = drillDownData.data.map(row => {
      const filteredRow = {};
      visibleColumns.forEach(col => { filteredRow[col] = row[col] || ''; });
      return filteredRow;
    });
    downloadCSV(exportData, `${drillDownData.dsp}_${drillDownData.rowKey}_details.csv`);
  };

  const formatValue = (value, aggregation) => {
    if (aggregation === 'value' || aggregation === 'count') return value;
    if (typeof value === 'number') return value.toFixed(4);
    return value;
  };

  // Whether the current row field is the transporter ID column (drives name display)
  const transporterCol = findColumn(config.transporterColumn);
  const showRowNames = pivotConfig.rowField === transporterCol;

  // Small helper: renders the name (or dash) line under an ID
  const NameLine = ({ id }) => (
    <span className={`text-xs font-normal ${getTransporterName(id) ? 'text-cyan-300' : 'text-slate-600'}`}>({getTransporterName(id) || '—'})</span>
  );

  // Render tables
  const renderHierarchicalTable = (pivot) => {
    const sortedParentKeys = Object.keys(pivot.data).sort((a, b) => (pivot.data[b].values.value_0 || 0) - (pivot.data[a].values.value_0 || 0));
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gradient-to-r from-slate-800 to-slate-700">
              <th className="text-left px-3 py-1.5 text-cyan-300 font-semibold border border-slate-600">{pivotConfig.rowField}</th>
              {pivotConfig.valueFields.map((vf, vfIndex) => vf.field && (
                <th key={vfIndex} className="text-right px-3 py-1.5 text-cyan-300 font-semibold border border-slate-600">{getAggregationLabel(vf.aggregation)} of {vf.field}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedParentKeys.map((parentKey) => {
              const parentData = pivot.data[parentKey];
              const isExpanded = expandedRows[`${pivot.dsp}-${parentKey}`];
              const children = parentData.children;
              const sortedChildKeys = Object.keys(children).sort((a, b) => (children[b].values.value_0 || 0) - (children[a].values.value_0 || 0));
              const rowLabelCellId = `${pivot.dsp}-row-${parentKey}`;
              return (
                <React.Fragment key={parentKey}>
                  <tr className="bg-slate-900 hover:bg-slate-800 cursor-pointer font-bold" onClick={() => toggleRowExpansion(`${pivot.dsp}-${parentKey}`)}>
                    <td className={`px-3 py-1.5 border border-slate-700 cursor-pointer ${getRowLabelHighlightClass(rowLabelCellId) || 'text-white'}`} onClick={(e) => { e.stopPropagation(); toggleManualHighlight(rowLabelCellId, e); }}>
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-cyan-400" /> : <ChevronRight className="w-4 h-4 text-cyan-400" />}
                        <div className="flex flex-col">
                          <span>{parentKey}</span>
                          {showRowNames && <NameLine id={parentKey} />}
                        </div>
                      </div>
                    </td>
                    {pivotConfig.valueFields.map((vf, vfIndex) => {
                      if (!vf.field) return null;
                      const value = parentData.values[`value_${vfIndex}`];
                      const cellId = `${pivot.dsp}-${parentKey}-${vfIndex}`;
                      return (
                        <td key={vfIndex} className={`px-3 py-1.5 text-right border border-slate-700 cursor-pointer transition-all ${getHighlightClass(value, cellId) || 'text-white'}`}
                          onClick={(e) => { e.stopPropagation(); toggleManualHighlight(cellId, e); }}
                          onDoubleClick={(e) => { e.stopPropagation(); handleDrillDown(parentData.rawData, parentKey, pivot.dsp); }}
                          title="Click to highlight, Double-click for details">{formatValue(value, vf.aggregation)}</td>
                      );
                    })}
                  </tr>
                  {isExpanded && sortedChildKeys.map((childKey) => {
                    const childData = children[childKey];
                    const childRowLabelCellId = `${pivot.dsp}-row-${parentKey}-${childKey}`;
                    return (
                      <tr key={`${parentKey}-${childKey}`} className="bg-slate-950 hover:bg-slate-900">
                        <td className={`px-3 py-1.5 border border-slate-700 pl-10 cursor-pointer ${getRowLabelHighlightClass(childRowLabelCellId) || 'text-gray-300'}`} onClick={(e) => toggleManualHighlight(childRowLabelCellId, e)}>{childKey}</td>
                        {pivotConfig.valueFields.map((vf, vfIndex) => {
                          if (!vf.field) return null;
                          const value = childData.values[`value_${vfIndex}`];
                          const cellId = `${pivot.dsp}-${parentKey}-${childKey}-${vfIndex}`;
                          return (
                            <td key={vfIndex} className={`px-3 py-1.5 text-right border border-slate-700 cursor-pointer transition-all ${getHighlightClass(value, cellId) || 'text-gray-300'}`}
                              onClick={(e) => toggleManualHighlight(cellId, e)}
                              onDoubleClick={(e) => { e.stopPropagation(); handleDrillDown(childData.rawData, childKey, pivot.dsp); }}
                              title="Click to highlight, Double-click for details">{formatValue(value, vf.aggregation)}</td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderStandardTable = (pivot) => {
    const sortedKeys = Object.keys(pivot.data).sort((a, b) => (pivot.data[b].values.value_0 || 0) - (pivot.data[a].values.value_0 || 0));
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gradient-to-r from-slate-800 to-slate-700">
              <th className="text-left px-3 py-1.5 text-cyan-300 font-semibold border border-slate-600">{pivotConfig.rowField}</th>
              {pivotConfig.valueFields.map((vf, vfIndex) => vf.field && (
                <th key={vfIndex} className="text-right px-3 py-1.5 text-cyan-300 font-semibold border border-slate-600">{getAggregationLabel(vf.aggregation)} of {vf.field}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedKeys.map((rowKey) => {
              const rowData = pivot.data[rowKey];
              const rowLabelCellId = `${pivot.dsp}-row-${rowKey}`;
              return (
                <tr key={rowKey} className="bg-slate-900 hover:bg-slate-800">
                  <td className={`px-3 py-1.5 border border-slate-700 font-medium cursor-pointer ${getRowLabelHighlightClass(rowLabelCellId) || 'text-white'}`} onClick={(e) => toggleManualHighlight(rowLabelCellId, e)}>
                    <div className="flex flex-col">
                      <span>{rowKey}</span>
                      {showRowNames && <NameLine id={rowKey} />}
                    </div>
                  </td>
                  {pivotConfig.valueFields.map((vf, vfIndex) => {
                    if (!vf.field) return null;
                    const value = rowData.values[`value_${vfIndex}`];
                    const cellId = `${pivot.dsp}-${rowKey}-${vfIndex}`;
                    return (
                      <td key={vfIndex} className={`px-3 py-1.5 text-right border border-slate-700 cursor-pointer transition-all ${getHighlightClass(value, cellId) || 'text-white'}`}
                        onClick={(e) => toggleManualHighlight(cellId, e)}
                        onDoubleClick={(e) => { e.stopPropagation(); handleDrillDown(rowData.rawData, rowKey, pivot.dsp); }}
                        title="Click to highlight, Double-click for details">{formatValue(value, vf.aggregation)}</td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderComparisonTable = (pivot, compareVal) => {
    const sortedKeys = [...pivot.rowKeys].filter(rowKey => pivot.data[compareVal]?.[rowKey]).sort((a, b) => (pivot.data[compareVal]?.[b]?.values?.value_0 || 0) - (pivot.data[compareVal]?.[a]?.values?.value_0 || 0));
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gradient-to-r from-slate-800 to-slate-700">
              <th className="text-left px-3 py-1.5 text-cyan-300 font-semibold border border-slate-600">{pivotConfig.rowField}</th>
              {pivotConfig.valueFields.map((vf, vfIndex) => vf.field && (
                <th key={vfIndex} className="text-right px-3 py-1.5 text-cyan-300 font-semibold border border-slate-600">{getAggregationLabel(vf.aggregation)} of {vf.field}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedKeys.map((rowKey) => {
              const rowData = pivot.data[compareVal][rowKey];
              const rowLabelCellId = `${pivot.dsp}-${compareVal}-row-${rowKey}`;
              return (
                <tr key={rowKey} className="bg-slate-900 hover:bg-slate-800">
                  <td className={`px-3 py-1.5 border border-slate-700 font-medium cursor-pointer ${getRowLabelHighlightClass(rowLabelCellId) || 'text-white'}`} onClick={(e) => toggleManualHighlight(rowLabelCellId, e)}>
                    <div className="flex flex-col">
                      <span>{rowKey}</span>
                      {showRowNames && <NameLine id={rowKey} />}
                    </div>
                  </td>
                  {pivotConfig.valueFields.map((vf, vfIndex) => {
                    if (!vf.field) return null;
                    const value = rowData?.values?.[`value_${vfIndex}`] ?? 0;
                    const cellId = `${pivot.dsp}-${compareVal}-${rowKey}-${vfIndex}`;
                    return (
                      <td key={vfIndex} className={`px-3 py-1.5 text-right border border-slate-700 cursor-pointer transition-all ${getHighlightClass(value, cellId) || 'text-white'}`}
                        onClick={(e) => toggleManualHighlight(cellId, e)}
                        onDoubleClick={(e) => { e.stopPropagation(); handleDrillDown(rowData.rawData, rowKey, pivot.dsp, compareVal); }}
                        title="Click to highlight, Double-click for details">{formatValue(value, vf.aggregation)}</td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const dspCol = findColumn(config.dspColumn);
  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  // ===== RENDER =====
  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-full mx-auto px-2">
        {/* Header with Back Button */}
        <div className="mb-8">
          <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors">
            <ArrowLeft className="w-5 h-5" /> Back to Hub
          </button>
          <div className="text-center">
            <h1 className={`text-4xl font-bold ${accentText} mb-2`}>{config.title}</h1>
            <p className="text-gray-400">{config.subtitle}</p>
          </div>
        </div>

        {/* File Upload */}
        <div className="bg-slate-900 rounded-xl shadow-lg p-6 mb-6 border border-slate-700">
          <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-600 rounded-xl cursor-pointer hover:bg-slate-800 hover:${accentBorder} transition-all duration-300`}>
            <div className="flex flex-col items-center">
              <Upload className={`w-10 h-10 ${accentText} mb-2`} />
              <span className="text-lg font-medium text-gray-300">Click to upload CSV file</span>
            </div>
            <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
          </label>
          {data.length > 0 && (
            <div className="mt-4 p-3 bg-green-900/30 rounded-lg border border-green-700">
              <p className="text-green-400 font-medium">✓ Loaded {data.length} rows with {columns.length} columns</p>
            </div>
          )}

          {/* Names file upload (Transporter ID -> name). Held only in-app, never stored. */}
          <label className="flex flex-col items-center justify-center w-full h-24 mt-4 border-2 border-dashed border-slate-600 rounded-xl cursor-pointer hover:bg-slate-800 hover:border-purple-500 transition-all duration-300">
            <div className="flex flex-col items-center text-center px-2">
              <Upload className="w-7 h-7 text-purple-400 mb-1" />
              <span className="text-sm font-medium text-gray-300">Upload names file (Transporter ID → name)</span>
              <span className="text-xs text-gray-500">Optional — shows the driver name under each Transporter ID</span>
            </div>
            <input type="file" className="hidden" accept=".csv" onChange={handleNamesUpload} />
          </label>
          {namesLoadedCount > 0 && (
            <div className="mt-3 p-3 bg-purple-900/30 rounded-lg border border-purple-700">
              <p className="text-purple-300 font-medium">✓ Matched {namesLoadedCount} Transporter IDs to names</p>
            </div>
          )}
        </div>

        {/* DSP Selection */}
        {data.length > 0 && dspCol && availableValues[dspCol] && (
          <div className="bg-slate-900 rounded-xl shadow-lg p-6 mb-6 border border-slate-700">
            <h2 className={`text-xl font-bold ${accentText} mb-4`}>Select DSPs</h2>
            <div className="flex flex-wrap gap-2">
              {availableValues[dspCol].map(dsp => (
                <button key={dsp} onClick={() => toggleDSP(dsp)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${selectedDSPs.includes(dsp) ? `${accentBg} text-white shadow-lg` : 'bg-slate-700 text-gray-300 hover:bg-slate-600'}`}>
                  {dsp}{selectedDSPs.includes(dsp) && <X className="inline-block ml-2 w-4 h-4" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* One-Click Views (presets) */}
        {data.length > 0 && config.presets && config.presets.length > 0 && (
          <div className="bg-slate-900 rounded-xl shadow-lg p-6 mb-6 border border-slate-700">
            <div className="flex items-center gap-2 mb-1">
              <Zap className={`w-5 h-5 ${accentText}`} />
              <h2 className={`text-xl font-bold ${accentText}`}>One-Click Views</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4">Instantly build a preset pivot for your emails — grab your snip and go. You can still tweak anything below afterward.</p>
            <div className="flex flex-wrap gap-2">
              {config.presets.map((preset) => (
                <button key={preset.label} onClick={() => applyPreset(preset)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${activePreset === preset.label ? `bg-gradient-to-r ${accentGradient} text-white shadow-lg` : 'bg-slate-800 text-gray-200 border border-slate-600 hover:border-slate-400'}`}>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pivot Configuration */}
        {data.length > 0 && (
          <div className="bg-slate-900 rounded-xl shadow-lg p-6 mb-6 border border-slate-700">
            <h2 className={`text-xl font-bold ${accentText} mb-6`}>Pivot Configuration</h2>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-300 mb-2">Row Field (Parent) *</label>
              <select className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none" value={pivotConfig.rowField} onChange={(e) => setPivotConfig({...pivotConfig, rowField: e.target.value})}>
                <option value="">Select field...</option>
                {columns.map(col => <option key={col} value={col}>{col}</option>)}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-300 mb-2">Sub-Row Field (Child - Optional)</label>
              <select className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none" value={pivotConfig.subRowField} onChange={(e) => setPivotConfig({...pivotConfig, subRowField: e.target.value})}>
                <option value="">None (flat table)</option>
                {columns.filter(col => col !== pivotConfig.rowField).map(col => <option key={col} value={col}>{col}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">Select to create hierarchical grouping like Excel pivot tables</p>
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <label className="block text-sm font-semibold text-gray-300">Value Fields *</label>
                <button onClick={addValueField} className="flex items-center gap-2 px-3 py-1 text-sm bg-cyan-900/50 text-cyan-400 rounded-lg hover:bg-cyan-900 transition-all">
                  <Plus className="w-4 h-4" />Add Value
                </button>
              </div>
              {pivotConfig.valueFields.map((vf, index) => (
                <div key={index} className="flex gap-3 mb-3 items-center">
                  <select className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none" value={vf.field} onChange={(e) => updateValueField(index, 'field', e.target.value)}>
                    <option value="">Select field...</option>
                    {columns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                  <select className="w-36 bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none" value={vf.aggregation} onChange={(e) => updateValueField(index, 'aggregation', e.target.value)}>
                    <option value="count">Count</option>
                    <option value="sum">Sum</option>
                    <option value="average">Average</option>
                    <option value="min">Min</option>
                    <option value="max">Max</option>
                    <option value="value">Value (Actual)</option>
                  </select>
                  {pivotConfig.valueFields.length > 1 && (
                    <button onClick={() => removeValueField(index)} className="p-3 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
                  )}
                </div>
              ))}
              <p className="text-xs text-gray-500">Use "Value (Actual)" to see the actual cell content instead of aggregations</p>
            </div>

            {/* Side-by-Side Comparison */}
            {!pivotConfig.subRowField && (
              <div className="mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                <h3 className="text-md font-semibold text-purple-400 mb-4">📊 Side-by-Side Comparison (Optional)</h3>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-300 mb-2">Compare Field</label>
                  <select className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:outline-none" value={pivotConfig.compareField} onChange={(e) => setPivotConfig({...pivotConfig, compareField: e.target.value, compareValues: []})}>
                    <option value="">None (standard pivot)</option>
                    {columns.filter(col => !config.dspColumn.some(d => col.toLowerCase().includes(d))).map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                {pivotConfig.compareField && availableValues[pivotConfig.compareField] && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">Select values to compare:</label>
                    <div className="flex flex-wrap gap-2">
                      {availableValues[pivotConfig.compareField].map(val => (
                        <button key={val} onClick={() => toggleCompareValue(val)} className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${pivotConfig.compareValues.includes(val) ? 'bg-purple-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'}`}>{val}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filters */}
            <div className="border-t border-slate-700 pt-4 mt-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-md font-semibold text-gray-300">Filters (Optional)</h3>
                <select className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none" onChange={(e) => { if (e.target.value) { addFilter(e.target.value); e.target.value = ''; } }}>
                  <option value="">+ Add Filter</option>
                  {columns.filter(col => !pivotConfig.filters[col] && col !== pivotConfig.compareField).map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              {Object.keys(pivotConfig.filters).length > 0 && (
                <div className="space-y-2">
                  {Object.keys(pivotConfig.filters).map(filterCol => (
                    <div key={filterCol} className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg">
                      <span className="text-sm font-semibold text-gray-300 w-40">{filterCol}:</span>
                      <select className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none" value={pivotConfig.filters[filterCol]} onChange={(e) => updateFilter(filterCol, e.target.value)}>
                        <option value="">All</option>
                        {availableValues[filterCol] && availableValues[filterCol].map(val => <option key={val} value={val}>{val}</option>)}
                      </select>
                      <button onClick={() => removeFilter(filterCol)} className="p-2 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Highlighting */}
            <div className="border-t border-slate-700 pt-4 mt-4">
              <h3 className="text-md font-semibold text-gray-300 mb-4">🎨 Highlighting Options</h3>
              <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <p className="text-sm font-semibold text-yellow-400 mb-2">⚠️ Yellow Auto-Highlight (Attention/Issues)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-400 mb-2">Condition</label>
                    <select className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none" value={highlightConfig.condition} onChange={(e) => setHighlightConfig({...highlightConfig, condition: e.target.value})}>
                      <option value="greater">Greater than</option>
                      <option value="less">Less than</option>
                      <option value="equal">Equal to</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-400 mb-2">Threshold Value</label>
                    <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none" value={highlightConfig.value} onChange={(e) => setHighlightConfig({...highlightConfig, value: e.target.value})} placeholder="Enter value..." />
                  </div>
                </div>
              </div>
              <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-green-400">✅ Green Auto-Highlight (Improvements)</p>
                  <label className="flex items-center cursor-pointer">
                    <input type="checkbox" className="mr-2 w-4 h-4" checked={greenHighlightConfig.enabled} onChange={(e) => setGreenHighlightConfig({...greenHighlightConfig, enabled: e.target.checked})} />
                    <span className="text-sm text-gray-400">Enable</span>
                  </label>
                </div>
                {greenHighlightConfig.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-400 mb-2">Condition</label>
                      <select className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none" value={greenHighlightConfig.condition} onChange={(e) => setGreenHighlightConfig({...greenHighlightConfig, condition: e.target.value})}>
                        <option value="greater">Greater than</option>
                        <option value="less">Less than</option>
                        <option value="equal">Equal to</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-400 mb-2">Threshold Value</label>
                      <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none" value={greenHighlightConfig.value} onChange={(e) => setGreenHighlightConfig({...greenHighlightConfig, value: e.target.value})} placeholder="Enter value..." />
                    </div>
                  </div>
                )}
              </div>
              <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <p className="text-sm font-semibold text-gray-300 mb-2">🖱️ Manual Click Highlight Color</p>
                <div className="flex gap-2">
                  <button className={`px-4 py-2 rounded-lg font-medium transition-all ${manualHighlightColor === 'orange' ? 'bg-amber-500 text-black' : 'bg-slate-700 text-amber-400 border border-amber-500'}`} onClick={() => setManualHighlightColor('orange')}>Orange (Attention)</button>
                  <button className={`px-4 py-2 rounded-lg font-medium transition-all ${manualHighlightColor === 'green' ? 'bg-green-500 text-black' : 'bg-slate-700 text-green-400 border border-green-500'}`} onClick={() => setManualHighlightColor('green')}>Green (Improvement)</button>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-3">
                💡 <span className="text-yellow-400">Yellow</span> = Auto-highlight (issues) | <span className="text-green-400"> Green</span> = Auto/Manual (improvements) | <span className="text-amber-500"> Orange</span> = Manual (attention) | Double-click for drill-down
              </p>
            </div>

            <button onClick={createPivotTables} className={`w-full mt-6 bg-gradient-to-r ${accentGradient} text-white py-4 px-6 rounded-xl transition-all font-semibold text-lg shadow-lg`}>Generate Pivot Tables</button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6 flex items-start">
            <AlertCircle className="w-6 h-6 text-red-400 mr-3 flex-shrink-0 mt-0.5" />
            <span className="text-red-300 font-medium">{error}</span>
          </div>
        )}

        {/* Manager View */}
        {pivotTables.length > 0 && (
          <div className="mb-6">
            <button onClick={() => setShowManagerView(!showManagerView)} className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-xl hover:from-purple-600 hover:to-indigo-600 transition-all font-semibold shadow-lg">
              {showManagerView ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              {showManagerView ? 'Hide Manager View' : 'Show Manager View'}
            </button>
            {showManagerView && (
              <div className="mt-4 bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl shadow-2xl p-6 border border-purple-700/50">
                <h2 className="text-2xl font-bold text-purple-400 mb-6 flex items-center gap-2">📊 Manager View - Overall Data Analysis</h2>
                {(() => {
                  const managerData = generateManagerViewData();
                  if (!managerData) return <p className="text-gray-400">No data available for analysis.</p>;
                  return (
                    <div className="space-y-6">
                      {/* Data Info */}
                      <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-600 text-sm">
                        <p className="text-gray-400 mb-2"><strong className="text-gray-300">📁 Data Loaded:</strong> {managerData.summary.totalConcessions.toLocaleString()} valid rows</p>
                        <p className="text-gray-400 mb-1">
                          <strong className="text-gray-300">Columns detected:</strong>{' '}
                          Sub Bucket: <span className={managerData.columns.hasSubBucket ? 'text-green-400' : 'text-red-400'}>{managerData.columns.subBucketColName}</span> | 
                          DSP: <span className={managerData.columns.hasDSP ? 'text-green-400' : 'text-red-400'}>{managerData.columns.dspColName}</span> | 
                          Driver: <span className={managerData.columns.hasDriver ? 'text-green-400' : 'text-red-400'}>{managerData.columns.driverColName}</span> | 
                          Cost: <span className={managerData.columns.hasCost ? 'text-green-400' : 'text-red-400'}>{managerData.columns.costColName}</span> | 
                          Week: <span className={managerData.columns.hasWeek ? 'text-green-400' : 'text-red-400'}>{managerData.columns.weekColName}</span>
                        </p>
                        {managerData.summary.weeksFound.length > 0 && <p className="text-gray-400"><strong className="text-gray-300">Weeks in data:</strong> <span className="text-cyan-400">{managerData.summary.weeksFound.join(', ')}</span></p>}
                      </div>

                      {/* Summary Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700"><p className="text-gray-400 text-sm">Total Concessions</p><p className="text-2xl font-bold text-white">{managerData.summary.totalConcessions.toLocaleString()}</p></div>
                        {managerData.columns.hasCost && <div className="bg-slate-800 rounded-lg p-4 border border-slate-700"><p className="text-gray-400 text-sm">Total Cost</p><p className="text-2xl font-bold text-red-400">{formatCurrency(managerData.summary.totalCost)}</p></div>}
                        {managerData.columns.hasCost && <div className="bg-slate-800 rounded-lg p-4 border border-slate-700"><p className="text-gray-400 text-sm">Avg Cost/Concession</p><p className="text-2xl font-bold text-orange-400">{formatCurrency(managerData.summary.avgCostPerConcession)}</p></div>}
                        {managerData.columns.hasDriver && <div className="bg-slate-800 rounded-lg p-4 border border-slate-700"><p className="text-gray-400 text-sm">Unique Drivers</p><p className="text-2xl font-bold text-cyan-400">{managerData.summary.uniqueDrivers}</p></div>}
                        {managerData.columns.hasDSP && <div className="bg-slate-800 rounded-lg p-4 border border-slate-700"><p className="text-gray-400 text-sm">DSPs Affected</p><p className="text-2xl font-bold text-purple-400">{managerData.summary.uniqueDSPs}</p></div>}
                      </div>

                      {/* L2 Bucket Analysis (Late Delivery specific) */}
                      {managerData.columns.hasL2 && managerData.l2Analysis.length > 0 && (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <h3 className="text-lg font-bold text-orange-400 mb-4">📦 L2 Bucket Breakdown</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead><tr className="border-b border-slate-600"><th className="text-left p-2 text-gray-400 text-sm">L2 Bucket</th><th className="text-right p-2 text-gray-400 text-sm">Count</th><th className="text-right p-2 text-gray-400 text-sm">% of Total</th>{managerData.columns.hasCost && <th className="text-right p-2 text-gray-400 text-sm">Cost</th>}</tr></thead>
                              <tbody>
                                {managerData.l2Analysis.map((item, idx) => (
                                  <tr key={item.bucket} className={`border-b border-slate-700 ${idx < 2 ? 'bg-orange-900/20' : ''}`}>
                                    <td className="p-2 text-white font-medium">{item.bucket}</td>
                                    <td className="p-2 text-right text-cyan-400 font-bold">{item.count}</td>
                                    <td className="p-2 text-right text-gray-300">{item.percentage}%</td>
                                    {managerData.columns.hasCost && <td className="p-2 text-right text-red-400">{formatCurrency(item.cost)}</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Station Analysis */}
                      {managerData.columns.hasStation && managerData.stationAnalysis.length > 0 && (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <h3 className="text-lg font-bold text-blue-400 mb-4">🏭 Station Breakdown</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead><tr className="border-b border-slate-600"><th className="text-left p-2 text-gray-400 text-sm">Station</th><th className="text-right p-2 text-gray-400 text-sm">Count</th><th className="text-right p-2 text-gray-400 text-sm">% of Total</th>{managerData.columns.hasCost && <th className="text-right p-2 text-gray-400 text-sm">Cost</th>}</tr></thead>
                              <tbody>
                                {managerData.stationAnalysis.map((item, idx) => (
                                  <tr key={item.station} className={`border-b border-slate-700 ${idx === 0 ? 'bg-blue-900/20' : ''}`}>
                                    <td className="p-2 text-white font-medium">{item.station}</td>
                                    <td className="p-2 text-right text-cyan-400 font-bold">{item.count}</td>
                                    <td className="p-2 text-right text-gray-300">{item.percentage}%</td>
                                    {managerData.columns.hasCost && <td className="p-2 text-right text-red-400">{formatCurrency(item.cost)}</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Sub Bucket / L3 Analysis */}
                      {managerData.columns.hasSubBucket && managerData.subBucketAnalysis.length > 0 && (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <h3 className="text-lg font-bold text-yellow-400 mb-4">🚨 Root Causes Ranked by Frequency (High → Low)</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead><tr className="border-b border-slate-600"><th className="text-left p-2 text-gray-400 text-sm">Rank</th><th className="text-left p-2 text-gray-400 text-sm">Root Cause</th><th className="text-right p-2 text-gray-400 text-sm">Count</th><th className="text-right p-2 text-gray-400 text-sm">% of Total</th>{managerData.columns.hasCost && <th className="text-right p-2 text-gray-400 text-sm">Cost Impact</th>}<th className="text-left p-2 text-gray-400 text-sm">Definition & Action</th></tr></thead>
                              <tbody>
                                {managerData.subBucketAnalysis.map((item, idx) => (
                                  <tr key={item.bucket} className={`border-b border-slate-700 ${idx < 3 ? 'bg-red-900/20' : ''}`}>
                                    <td className="p-2 text-white font-bold">{idx + 1}</td>
                                    <td className="p-2 text-white font-medium">{item.bucket}</td>
                                    <td className="p-2 text-right text-cyan-400 font-bold cursor-pointer hover:text-cyan-300 hover:underline" onClick={() => handleSubBucketDrillDown(item.bucket)} title="Click to see details">{item.count}</td>
                                    <td className="p-2 text-right text-gray-300">{item.percentage}%</td>
                                    {managerData.columns.hasCost && <td className="p-2 text-right text-red-400">{formatCurrency(item.cost)}</td>}
                                    <td className="p-2 text-gray-300 text-sm max-w-md">{item.tip}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Cost Analysis */}
                      {managerData.columns.hasCost && managerData.costAnalysis.length > 0 && (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <h3 className="text-lg font-bold text-red-400 mb-4">💰 Root Causes Ranked by Cost Impact (High → Low)</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead><tr className="border-b border-slate-600"><th className="text-left p-2 text-gray-400 text-sm">Rank</th><th className="text-left p-2 text-gray-400 text-sm">Root Cause</th><th className="text-right p-2 text-gray-400 text-sm">Total Cost</th><th className="text-right p-2 text-gray-400 text-sm">Count</th><th className="text-right p-2 text-gray-400 text-sm">Avg Cost Each</th></tr></thead>
                              <tbody>
                                {managerData.costAnalysis.slice(0, 10).map((item, idx) => (
                                  <tr key={item.bucket} className={`border-b border-slate-700 ${idx < 3 ? 'bg-red-900/20' : ''}`}>
                                    <td className="p-2 text-white font-bold">{idx + 1}</td>
                                    <td className="p-2 text-white font-medium">{item.bucket}</td>
                                    <td className="p-2 text-right text-red-400 font-bold">{formatCurrency(item.cost)}</td>
                                    <td className="p-2 text-right text-cyan-400 cursor-pointer hover:text-cyan-300 hover:underline" onClick={() => handleSubBucketDrillDown(item.bucket)}>{item.count}</td>
                                    <td className="p-2 text-right text-orange-400">{formatCurrency(item.cost / item.count)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Driver Analysis */}
                      {managerData.columns.hasDriver && managerData.driverAnalysis.length > 0 && (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <h3 className="text-lg font-bold text-orange-400 mb-4">👤 Top Repeat Offender Drivers (Across All DSPs)</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead><tr className="border-b border-slate-600"><th className="text-left p-2 text-gray-400 text-sm">Rank</th><th className="text-left p-2 text-gray-400 text-sm">Driver ID</th>{managerData.columns.hasDSP && <th className="text-left p-2 text-gray-400 text-sm">DSP</th>}<th className="text-right p-2 text-gray-400 text-sm">Concessions</th><th className="text-right p-2 text-gray-400 text-sm">% of Total</th>{managerData.columns.hasCost && <th className="text-right p-2 text-gray-400 text-sm">Cost Impact</th>}</tr></thead>
                              <tbody>
                                {managerData.driverAnalysis.slice(0, 15).map((item, idx) => (
                                  <tr key={item.driver} className={`border-b border-slate-700 ${idx < 5 ? 'bg-orange-900/20' : ''}`}>
                                    <td className="p-2 text-white font-bold">{idx + 1}</td>
                                    <td className="p-2 text-cyan-400 font-mono text-sm">
                                      <div className="flex flex-col">
                                        <span>{item.driver}</span>
                                        <span className={`text-xs ${getTransporterName(item.driver) ? 'text-cyan-300' : 'text-slate-600'}`}>({getTransporterName(item.driver) || '—'})</span>
                                      </div>
                                    </td>
                                    {managerData.columns.hasDSP && <td className="p-2 text-purple-400">{item.dsp}</td>}
                                    <td className="p-2 text-right text-white font-bold">{item.count}</td>
                                    <td className="p-2 text-right text-gray-300">{item.percentage}%</td>
                                    {managerData.columns.hasCost && <td className="p-2 text-right text-red-400">{formatCurrency(item.cost)}</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* DSP Analysis */}
                      {managerData.columns.hasDSP && managerData.dspAnalysis.length > 0 && (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <h3 className="text-lg font-bold text-purple-400 mb-4">🏢 DSPs Ranked by Issue Count</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead><tr className="border-b border-slate-600"><th className="text-left p-2 text-gray-400 text-sm">Rank</th><th className="text-left p-2 text-gray-400 text-sm">DSP</th><th className="text-right p-2 text-gray-400 text-sm">Concessions</th><th className="text-right p-2 text-gray-400 text-sm">% of Total</th>{managerData.columns.hasCost && <th className="text-right p-2 text-gray-400 text-sm">Cost Impact</th>}</tr></thead>
                              <tbody>
                                {managerData.dspAnalysis.map((item, idx) => (
                                  <tr key={item.dsp} className={`border-b border-slate-700 ${idx < 3 ? 'bg-purple-900/20' : ''}`}>
                                    <td className="p-2 text-white font-bold">{idx + 1}</td>
                                    <td className="p-2 text-purple-400 font-medium">{item.dsp}</td>
                                    <td className="p-2 text-right text-white font-bold">{item.count}</td>
                                    <td className="p-2 text-right text-gray-300">{item.percentage}%</td>
                                    {managerData.columns.hasCost && <td className="p-2 text-right text-red-400">{formatCurrency(item.cost)}</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Tenure Analysis */}
                      {managerData.columns.hasTenure && managerData.tenureAnalysis.length > 0 && (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <h3 className="text-lg font-bold text-teal-400 mb-4">👤 Concessions by Driver Tenure</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead><tr className="border-b border-slate-600"><th className="text-left p-2 text-gray-400 text-sm">Driver Tenure</th><th className="text-right p-2 text-gray-400 text-sm">Concessions</th><th className="text-right p-2 text-gray-400 text-sm">% of Total</th>{managerData.columns.hasCost && <th className="text-right p-2 text-gray-400 text-sm">Cost Impact</th>}</tr></thead>
                              <tbody>
                                {managerData.tenureAnalysis.map((item, idx) => (
                                  <tr key={item.tenure} className={`border-b border-slate-700 ${idx === 0 ? 'bg-teal-900/20' : ''}`}>
                                    <td className="p-2 text-white font-medium">{item.tenure}</td>
                                    <td className="p-2 text-right text-cyan-400 font-bold">{item.count}</td>
                                    <td className="p-2 text-right text-teal-400 font-bold">{item.percentage}%</td>
                                    {managerData.columns.hasCost && <td className="p-2 text-right text-red-400">{formatCurrency(item.cost)}</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Week Trends */}
                      {managerData.columns.hasWeek && managerData.weekTrends.length > 1 && (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <h3 className="text-lg font-bold text-green-400 mb-4">📈 Week Over Week Trends</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead><tr className="border-b border-slate-600"><th className="text-left p-2 text-gray-400 text-sm">Week</th><th className="text-right p-2 text-gray-400 text-sm">Concessions</th>{managerData.columns.hasCost && <th className="text-right p-2 text-gray-400 text-sm">Cost</th>}<th className="text-right p-2 text-gray-400 text-sm">Change</th></tr></thead>
                              <tbody>
                                {managerData.weekTrends.map((item, idx) => {
                                  const prevCount = idx > 0 ? managerData.weekTrends[idx - 1].count : item.count;
                                  const change = item.count - prevCount;
                                  const changePercent = prevCount > 0 ? ((change / prevCount) * 100).toFixed(1) : 0;
                                  return (
                                    <tr key={item.week} className="border-b border-slate-700">
                                      <td className="p-2 text-white font-medium">{item.week}</td>
                                      <td className="p-2 text-right text-cyan-400 font-bold">{item.count}</td>
                                      {managerData.columns.hasCost && <td className="p-2 text-right text-red-400">{formatCurrency(item.cost)}</td>}
                                      <td className={`p-2 text-right font-bold ${change < 0 ? 'text-green-400' : change > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                        {idx === 0 ? '—' : `${change > 0 ? '+' : ''}${change} (${change > 0 ? '+' : ''}${changePercent}%)`}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Action Summary */}
                      <div className="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 rounded-lg p-4 border border-purple-600/50">
                        <h3 className="text-lg font-bold text-white mb-3">🎯 Recommended Actions</h3>
                        <div className="space-y-2 text-gray-200">
                          {managerData.subBucketAnalysis.slice(0, 3).map((item, idx) => (
                            <p key={item.bucket} className="flex items-start gap-2">
                              <span className="text-yellow-400 font-bold">{idx + 1}.</span>
                              <span><strong className="text-cyan-400">{item.bucket}</strong> ({item.count} issues, {item.percentage}%): Focus DSP coaching on this area. {item.tip.split('Action:')[1] || item.tip}</span>
                            </p>
                          ))}
                          {managerData.driverAnalysis.length > 0 && (
                            <p className="flex items-start gap-2 mt-3 pt-3 border-t border-slate-600">
                              <span className="text-orange-400 font-bold">⚠️</span>
                              <span>Top 5 repeat offenders account for {managerData.driverAnalysis.slice(0, 5).reduce((sum, d) => sum + parseFloat(d.percentage), 0).toFixed(1)}% of all concessions. Prioritize coaching these drivers with their DSPs.</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Pivot Tables Display */}
        {pivotTables.length > 0 && (
          <div className="space-y-6">
            {pivotTables.map((pivot, pivotIndex) => (
              <div key={pivotIndex} className="bg-slate-900 rounded-xl shadow-xl p-6 border border-slate-700">
                <div className="flex justify-between items-center mb-4">
                  <h2 className={`text-2xl font-bold ${accentText}`}>DSP: {pivot.dsp}</h2>
                  <button onClick={() => downloadPivotTable(pivot)} className="flex items-center gap-2 px-4 py-2 bg-green-900/50 text-green-400 rounded-lg hover:bg-green-900 transition-all">
                    <Download className="w-4 h-4" />Export CSV
                  </button>
                </div>
                {generateSummaryStatement(pivot) && (
                  <div className="mb-4 p-4 bg-slate-800 border border-slate-600 rounded-lg">
                    <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{generateSummaryStatement(pivot)}</p>
                  </div>
                )}
                {pivot.isHierarchical ? renderHierarchicalTable(pivot) : pivot.isComparison ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pivotConfig.compareValues.map((compareVal) => (
                      <div key={compareVal}>
                        <div className="mb-2 p-2 bg-purple-900/30 rounded-lg text-center"><h3 className="font-bold text-purple-400 text-sm">{pivotConfig.compareField}: {compareVal}</h3></div>
                        {renderComparisonTable(pivot, compareVal)}
                      </div>
                    ))}
                  </div>
                ) : renderStandardTable(pivot)}
              </div>
            ))}
          </div>
        )}

        {/* Drill-Down Modal */}
        {showDrillDown && drillDownData && (
          <div className="fixed inset-0 bg-black/60 z-50" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            <div className="absolute bg-slate-900 rounded-xl shadow-2xl overflow-hidden border border-slate-700 flex flex-col"
              style={{ left: `${modalPosition.x}%`, top: `${modalPosition.y}%`, width: `${modalSize.width}%`, height: `${modalSize.height}%`, transform: 'translate(0, 0)' }}>
              <div className="modal-header p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center cursor-move select-none" onMouseDown={handleMouseDown}>
                <div>
                  <h3 className="text-xl font-bold text-cyan-400">Details: {drillDownData.rowKey}</h3>
                  <p className="text-sm text-gray-400">DSP: {drillDownData.dsp} | {drillDownData.data.length} records <span className="ml-2 text-gray-500">(Drag header to move, drag corner to resize)</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowColumnSelector(!showColumnSelector)} className="flex items-center gap-2 px-3 py-2 bg-slate-700 text-gray-300 rounded-lg hover:bg-slate-600 transition-all"><Settings className="w-4 h-4" />Columns</button>
                  <button onClick={downloadDrillDownData} className="flex items-center gap-2 px-3 py-2 bg-green-900/50 text-green-400 rounded-lg hover:bg-green-900 transition-all"><Download className="w-4 h-4" />Export</button>
                  <button onClick={maximizeModal} className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all" title="Maximize"><ChevronRight className="w-5 h-5 rotate-45" /></button>
                  <button onClick={resetModalSize} className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all" title="Reset Size"><ChevronDown className="w-5 h-5" /></button>
                  <button onClick={closeDrillDown} className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all"><X className="w-6 h-6" /></button>
                </div>
              </div>
              {showColumnSelector && (
                <div className="p-4 bg-slate-800/50 border-b border-slate-700">
                  <p className="text-sm text-gray-400 mb-2">Toggle columns:</p>
                  <div className="flex flex-wrap gap-2">
                    {columns.map(col => (
                      <button key={col} onClick={() => toggleColumnVisibility(col)} className={`px-3 py-1 text-xs rounded-lg transition-all ${visibleColumns.includes(col) ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-gray-400'}`}>
                        {visibleColumns.includes(col) ? <Eye className="w-3 h-3 inline mr-1" /> : <EyeOff className="w-3 h-3 inline mr-1" />}{col}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0">
                    <tr className="bg-slate-800">
                      {visibleColumns.map(col => <th key={col} className="text-left p-3 text-cyan-300 font-semibold border border-slate-700 text-sm whitespace-nowrap">{col}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {drillDownData.data.map((row, rowIndex) => (
                      <tr key={rowIndex} className="bg-slate-900 hover:bg-slate-800">
                        {visibleColumns.map(col => <td key={col} className="p-3 text-gray-300 border border-slate-700 text-sm">{row[col] || ''}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize bg-slate-700 hover:bg-slate-600 rounded-tl-lg flex items-center justify-center" onMouseDown={handleResizeMouseDown}>
                <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" /></svg>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// HUB / LANDING PAGE
// ============================================================

// ============================================================
// OTD TRACKER (shared, live) — added platform
// ============================================================

const OTD_NW = 12;
const OTD_POLL_MS = 3500;
const OTD_DEFAULT_STATIONS = ["PNPT Pad 2","PNPT Pad 1","NEXL Pad 2","NEXL/LCML Pad 1","LCML Pad 2","TFGL Pad 1","TFGL Pad 2","CLGS Pad 1","CLGS Pad 2","CLGS Pad 1","Pad 2","Pad 1"];
const OTD_DEFAULT_CPT   = ["10:15","10:20","10:40","10:45","11:05","11:10","11:30","11:35","11:55","12:00","12:20","12:25"];
const OTD_DEFAULT_STAGE = ["9:50","9:55","10:15","10:20","10:40","10:45","11:05","11:10","11:30","11:35","",""];

// One color per wave, grouped by station like the source sheet.
const OTD_WAVE_COLORS = ["#2f6df0","#4f8ef7","#e0453f","#f2726e","#37b24d","#74b816","#f0a500","#e6c015","#12b3a6","#10b981","#8b5cf6","#a855f7"];

const OTD_ROWS = [
  {key:"firstVan",   label:"First Van Arrival",                    type:"time", total:null},
  {key:"lastVan",    label:"Last Van Arrival",                     type:"time", total:null},
  {key:"lastDep",    label:"Last Van Departure",                   type:"time", total:null},
  {key:"stager",     label:"'Stager' Departed (Swipe)",            type:"time", total:null},
  {key:"cpt",        label:"CPT",                                  type:"time", total:null, cpt:true, def:OTD_DEFAULT_CPT},
  {key:"reqRoutes",  label:"Routes Requested",                     type:"num",  total:"sum"},
  {key:"schedRoutes",label:"Routes Scheduled",                     type:"num",  total:"sum"},
  {key:"actRoutes",  label:"Actual Routes",                        type:"num",  total:"sum"},
  {key:"dropRoutes", label:"Dropped Routes",                       type:"num",  total:"sum"},
  {key:"lateVans",   label:"Number of late vans",                  type:"num",  total:"sum"},
  {key:"lateStaged", label:"Number of late staged routes",         type:"num",  total:"stagepct"},
  {key:"inProgress", label:"Routes in progress",                   type:"num",  total:null},
  {key:"unassigned", label:"Unassigned (Routes/picklist)",         type:"text", total:null},
  {key:"pickTimes",  label:"Average pick times (route/picklist)",  type:"text", total:null},
  {key:"stageBy",    label:"Stage by time",                        type:"time", total:null, def:OTD_DEFAULT_STAGE},
  {key:"lastCart",   label:"Time Last Cart Staged",                type:"time", total:null},
  {key:"stepVan",    label:"Step Van Count",                       type:"num",  total:"sum"},
  {key:"cdv",        label:"CDV Count",                            type:"num",  total:"sum"},
];
const OTD_ROWIDX = {}; OTD_ROWS.forEach((r,i)=>{ OTD_ROWIDX[r.key] = i; });

function otdRGBA(hex, a){
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
function otdTodayISO(){
  const t = new Date(), z = n => String(n).padStart(2,"0");
  return t.getFullYear()+"-"+z(t.getMonth()+1)+"-"+z(t.getDate());
}
function otdFresh(){
  const cells = {};
  OTD_ROWS.forEach(r => {
    cells[r.key] = [];
    for (let i=0;i<OTD_NW;i++) cells[r.key][i] = r.def ? (r.def[i]||"") : "";
  });
  return { stations: OTD_DEFAULT_STATIONS.slice(), cells };
}
const otdNum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const otdPct = f => (f*100).toFixed(2) + "%";

// Derived values (mirrors the workbook formulas)
function otdCompute(data){
  const C = data.cells;
  const rowTotals = {};
  OTD_ROWS.forEach(r => {
    if (r.total === "sum"){
      let s = 0; for (let i=0;i<OTD_NW;i++) s += otdNum(C[r.key][i]);
      rowTotals[r.key] = s ? String(s) : (C[r.key].some(v => String(v).trim()!=="") ? "0" : "");
    } else if (r.total === "stagepct"){
      let req=0, late=0;
      for (let i=0;i<OTD_NW;i++){ req += otdNum(C.reqRoutes[i]); late += otdNum(C.lateStaged[i]); }
      rowTotals[r.key] = req > 0 ? otdPct((req-late)/req) : "";
    } else rowTotals[r.key] = "";
  });
  const act = i => otdNum(C.actRoutes[i]);
  let totalRoutes = 0; for (let i=0;i<OTD_NW;i++) totalRoutes += act(i);
  const cum=[]; let run=0; for (let i=0;i<OTD_NW;i++){ run += otdNum(C.lateVans[i]); cum[i]=run; }
  const cumAct=[]; let ra=0; for (let i=0;i<OTD_NW;i++){ ra += act(i); cumAct[i]=ra; }
  const anyLateUpTo = i => { for (let j=0;j<=i;j++){ if (String(C.lateVans[j]).trim()!=="") return true; } return false; };
  const runOTD=[], projOTD=[], cumDisp=[];
  for (let i=0;i<OTD_NW;i++){
    runOTD[i]  = cumAct[i] > 0 ? (cumAct[i]-cum[i])/cumAct[i] : null;
    projOTD[i] = totalRoutes > 0 ? (totalRoutes-cum[i])/totalRoutes : null;
    cumDisp[i] = anyLateUpTo(i) ? String(cum[i]) : "";
  }
  let runTotal = null; for (let i=OTD_NW-1;i>=0;i--){ if (cumAct[i]>0){ runTotal=(cumAct[i]-cum[i])/cumAct[i]; break; } }
  const projTotal = totalRoutes > 0 ? (totalRoutes-cum[OTD_NW-1])/totalRoutes : null;
  const cumTotal = anyLateUpTo(OTD_NW-1) ? String(cum[OTD_NW-1]) : "";
  return { rowTotals, totalRoutes, runOTD, projOTD, cumDisp, runTotal, projTotal, cumTotal };
}
function otdPctClass(v){
  if (v === null || v === undefined) return "";
  if (v >= 0.98) return "bg-emerald-500/15 text-emerald-300";
  if (v >= 0.95) return "bg-amber-500/15 text-amber-300";
  return "bg-red-500/15 text-red-300";
}

function OTDTracker({ onBack }){
  const [dateStr, setDateStr] = React.useState(otdTodayISO());
  const [data, setData] = React.useState(otdFresh());
  const [status, setStatus] = React.useState({ kind:"", text:"Connecting…" });
  const pendingRef = React.useRef(new Set());
  const editingRef = React.useRef(null);
  const timersRef = React.useRef({});
  const loadTokenRef = React.useRef(0);

  const apiGet = async (date) => {
    const r = await fetch("/api/state?date=" + encodeURIComponent(date), { cache:"no-store" });
    if (!r.ok) throw new Error("GET " + r.status);
    return r.json();
  };
  const apiPost = async (payload) => {
    const r = await fetch("/api/state", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(payload) });
    if (!r.ok){ let m="POST "+r.status; try{ m=(await r.json()).error||m; }catch(e){} throw new Error(m); }
    return r.json();
  };

  // merge server data into local, without stomping cells being edited or mid-save
  const mergeServer = (prev, server) => {
    const stations = prev.stations.slice();
    if (server.stations){ for (const i in server.stations) stations[+i] = server.stations[i]; }
    const cells = {};
    OTD_ROWS.forEach(r => { cells[r.key] = prev.cells[r.key].slice(); });
    if (server.cells){
      for (const f in server.cells){
        const parts = f.split(":"); const row = OTD_ROWS[+parts[0]]; if (!row) continue;
        const c = +parts[1], k = row.key + ":" + c;
        if (pendingRef.current.has(k) || editingRef.current === k) continue;
        cells[row.key][c] = server.cells[f];
      }
    }
    return { stations, cells };
  };

  // load + poll when date changes
  React.useEffect(() => {
    const token = ++loadTokenRef.current;
    let timer = null;
    setData(otdFresh());
    setStatus({ kind:"", text:"Loading…" });
    (async () => {
      try {
        const s = await apiGet(dateStr);
        if (token !== loadTokenRef.current) return;
        setData(prev => mergeServer(prev, s));
        setStatus({ kind:"live", text:"Live" });
      } catch (e) { setStatus({ kind:"err", text:"Can't reach server" }); }
    })();
    const poll = async () => {
      try {
        const s = await apiGet(dateStr);
        if (token !== loadTokenRef.current) return;
        setData(prev => mergeServer(prev, s));
        setStatus({ kind:"live", text:"Live" });
      } catch (e) { setStatus({ kind:"err", text:"Offline — retrying" }); }
    };
    timer = setInterval(poll, OTD_POLL_MS);
    return () => { if (timer) clearInterval(timer); };
  }, [dateStr]);

  const queueCell = (key, col, value) => {
    const k = key + ":" + col;
    pendingRef.current.add(k);
    clearTimeout(timersRef.current[k]);
    timersRef.current[k] = setTimeout(async () => {
      try { await apiPost({ type:"cell", date:dateStr, row:OTD_ROWIDX[key], col, value }); setStatus({ kind:"live", text:"Saved ✓" }); }
      catch (e){ setStatus({ kind:"err", text:"Save failed" }); }
      finally { pendingRef.current.delete(k); }
    }, 350);
  };
  const queueStation = (i, value) => {
    const k = "station:" + i;
    clearTimeout(timersRef.current[k]);
    timersRef.current[k] = setTimeout(async () => {
      try { await apiPost({ type:"station", date:dateStr, i, value }); setStatus({ kind:"live", text:"Saved ✓" }); }
      catch (e){ setStatus({ kind:"err", text:"Save failed" }); }
    }, 350);
  };

  const setCell = (key, i, value) => {
    setData(prev => { const cells = { ...prev.cells, [key]: prev.cells[key].slice() }; cells[key][i] = value; return { ...prev, cells }; });
    queueCell(key, i, value);
  };
  const setStation = (i, value) => {
    setData(prev => { const stations = prev.stations.slice(); stations[i] = value; return { ...prev, stations }; });
    queueStation(i, value);
  };

  const resetTimes = () => {
    setData(prev => {
      const cells = { ...prev.cells, cpt: prev.cells.cpt.slice(), stageBy: prev.cells.stageBy.slice() };
      for (let i=0;i<OTD_NW;i++){ cells.cpt[i]=OTD_DEFAULT_CPT[i]||""; cells.stageBy[i]=OTD_DEFAULT_STAGE[i]||""; }
      return { ...prev, cells };
    });
    for (let i=0;i<OTD_NW;i++){ queueCell("cpt", i, OTD_DEFAULT_CPT[i]||""); queueCell("stageBy", i, OTD_DEFAULT_STAGE[i]||""); }
  };
  const resetDay = async () => {
    if (!window.confirm("Clear ALL entries for " + dateStr + " for everyone? This can't be undone.")) return;
    try { await apiPost({ type:"reset", date:dateStr }); } catch (e){}
    setData(otdFresh());
    setDateStr(d => d); // no-op; effect re-runs on remount of interval via state set below
    // force a reload
    loadTokenRef.current++;
    try { const s = await apiGet(dateStr); setData(prev => mergeServer(prev, s)); } catch (e){}
  };

  const comp = otdCompute(data);

  // shared cell styling helpers
  const labelCell = "sticky left-0 z-10 bg-slate-900 text-slate-200 text-left font-semibold px-3 whitespace-nowrap border border-slate-700";
  const totalCell = "bg-slate-800 text-amber-200 font-bold border border-slate-700 text-center";
  const inputBase = "w-full h-7 bg-transparent text-center text-slate-100 text-xs outline-none focus:bg-white/10";

  return (
    <div className="min-h-screen bg-slate-950 text-white p-3 md:p-5">
      <div className="w-full">
        {/* Top bar */}
        <div className="flex items-center flex-wrap gap-3 mb-5">
          <button onClick={onBack} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Hub
          </button>
          <div className="mr-auto">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30"><LayoutGrid className="w-5 h-5 text-emerald-400" /></span>
              On-Time Dispatch Tracker
            </h1>
            <p className="text-slate-400 text-xs mt-1">Shared board · everyone with the link edits the same waves</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] uppercase tracking-wide text-slate-500">Date</label>
            <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100" />
          </div>
          <button onClick={resetTimes} className="px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold">Reset times</button>
          <button onClick={resetDay} className="px-3 py-2 rounded-lg border border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-200 text-xs font-semibold">Reset day</button>
          <span className="flex items-center gap-2 text-[11px] text-slate-400 min-w-[92px]">
            <span className={"w-2 h-2 rounded-full " + (status.kind === "live" ? "bg-emerald-500" : status.kind === "err" ? "bg-red-500" : "bg-slate-500")}></span>
            {status.text}
          </span>
        </div>

        {/* Grid */}
        <div className="rounded-xl border border-slate-800 overflow-auto bg-slate-900/40">
          <table className="border-collapse" style={{ minWidth: "1750px", width: "100%", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "240px" }} />
              <col style={{ width: "72px" }} />
              {OTD_WAVE_COLORS.map((_, i) => <col key={i} style={{ minWidth: "118px" }} />)}
            </colgroup>
            <thead>
              {/* Wave numbers */}
              <tr>
                <th className={labelCell} style={{ height: "30px" }}></th>
                <th className="bg-slate-800 border border-slate-700"></th>
                {OTD_WAVE_COLORS.map((c, i) => (
                  <th key={i} className="border border-slate-700 text-slate-200 font-bold text-xs"
                      style={{ background: otdRGBA(c, 0.28) }}>Wave {i+1}</th>
                ))}
              </tr>
              {/* Stations (editable) + TOTAL */}
              <tr>
                <th className={labelCell}></th>
                <th className="bg-slate-800 text-slate-200 font-bold border border-slate-700 text-xs">TOTAL</th>
                {OTD_WAVE_COLORS.map((c, i) => (
                  <th key={i} className="border border-slate-700 p-0" style={{ background: otdRGBA(c, 0.9) }}>
                    <input value={data.stations[i] || ""} onChange={e => setStation(i, e.target.value)}
                      className="w-full h-7 bg-transparent text-center text-white text-[11px] font-bold outline-none focus:bg-black/20" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OTD_ROWS.map(r => (
                <tr key={r.key}>
                  <td className={labelCell} style={{ height: "30px" }}>{r.label}</td>
                  <td className={totalCell}>{comp.rowTotals[r.key]}</td>
                  {OTD_WAVE_COLORS.map((c, i) => {
                    const alpha = r.cpt ? 0.30 : 0.13;
                    return (
                      <td key={i} className="border border-slate-700 p-0" style={{ background: otdRGBA(c, alpha) }}>
                        <input
                          value={data.cells[r.key][i] || ""}
                          inputMode={r.type === "num" ? "numeric" : "text"}
                          onFocus={() => { editingRef.current = r.key + ":" + i; }}
                          onBlur={() => { if (editingRef.current === r.key + ":" + i) editingRef.current = null; }}
                          onChange={e => setCell(r.key, i, e.target.value)}
                          className={inputBase + (r.cpt ? " font-bold" : "")}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* spacer */}
              <tr><td className="h-2 bg-slate-950/60" colSpan={OTD_NW + 2}></td></tr>

              {/* Summary header */}
              <tr>
                <td className="bg-emerald-500/15 text-emerald-300 font-bold text-left px-3 border border-slate-700" colSpan={OTD_NW + 2} style={{ height: "28px" }}>SUMMARY TABLE</td>
              </tr>
              {/* Total Routes */}
              <tr>
                <td className={labelCell + " !bg-slate-800"}>Total Routes</td>
                <td className={totalCell}>{comp.totalRoutes ? comp.totalRoutes : ""}</td>
                {OTD_WAVE_COLORS.map((_, i) => <td key={i} className="border border-slate-700 bg-slate-900/60"></td>)}
              </tr>
              {/* Cumulative Lates */}
              <tr>
                <td className={labelCell + " !bg-slate-800"}>Cumulative Lates:</td>
                <td className={totalCell}>{comp.cumTotal}</td>
                {comp.cumDisp.map((v, i) => <td key={i} className="border border-slate-700 bg-slate-900/60 text-slate-200 text-xs font-semibold text-center">{v}</td>)}
              </tr>
              {/* Running OTD% */}
              <tr>
                <td className={labelCell + " !bg-slate-800"}>Running OTD%:</td>
                <td className={"border border-slate-700 text-center font-bold text-xs " + otdPctClass(comp.runTotal)}>{comp.runTotal === null ? "" : otdPct(comp.runTotal)}</td>
                {comp.runOTD.map((v, i) => <td key={i} className={"border border-slate-700 text-center font-bold text-xs " + otdPctClass(v)}>{v === null ? "" : otdPct(v)}</td>)}
              </tr>
              {/* Projected OTD% */}
              <tr>
                <td className={labelCell + " !bg-slate-800"}>Projected OTD%:</td>
                <td className={"border border-slate-700 text-center font-bold text-xs " + otdPctClass(comp.projTotal)}>{comp.projTotal === null ? "" : otdPct(comp.projTotal)}</td>
                {comp.projOTD.map((v, i) => <td key={i} className={"border border-slate-700 text-center font-bold text-xs " + otdPctClass(v)}>{v === null ? "" : otdPct(v)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-slate-500 items-center">
          <span>Each wave is color-coded by station.</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500/40 border border-emerald-500"></span> OTD ≥ 98%</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500/40 border border-amber-500"></span> 95–98%</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500/40 border border-red-500"></span> &lt; 95%</span>
          <span className="ml-auto">CPT &amp; Stage-by default times are pre-filled and stay unless changed · TOTAL &amp; OTD calculate automatically.</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// EMBEDDED HTML DASHBOARD (Watchtower / WWSC) — runs the original
// standalone HTML verbatim inside an isolated, full-screen iframe.
// ============================================================
function decodeHtmlB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function HtmlDashboard({ b64, title, onBack }) {
  const html = useMemo(() => decodeHtmlB64(b64), [b64]);
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-800 bg-slate-950/95 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Hub
        </button>
        <span className="text-slate-200 font-semibold text-sm truncate">{title}</span>
      </div>
      <iframe
        title={title}
        srcDoc={html}
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  );
}

// Full-screen wrapper for a same-origin page loaded by URL (used for the Flex
// tracker, which talks to /api/flex and so must run on the app's own origin
// rather than as an inline srcDoc document).
function UrlDashboard({ src, title, onBack }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-800 bg-slate-950/95 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Hub
        </button>
        <span className="text-slate-200 font-semibold text-sm truncate">{title}</span>
      </div>
      <iframe
        title={title}
        src={src}
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  );
}

export default function AnalyticsHub() {
  const [currentView, setCurrentView] = useState('hub');

  if (currentView === 'concessions') {
    return <PivotPlatform config={PLATFORM_CONFIGS.concessions} onBack={() => setCurrentView('hub')} />;
  }
  if (currentView === 'lateDelivery') {
    return <PivotPlatform config={PLATFORM_CONFIGS.lateDelivery} onBack={() => setCurrentView('hub')} />;
  }

  if (currentView === 'otd') {
    return <OTDTracker onBack={() => setCurrentView('hub')} />;
  }

  if (currentView === 'watchtower') {
    return <HtmlDashboard b64={WATCHTOWER_HTML_B64} title="Warehouse Compliance Dashboard" onBack={() => setCurrentView('hub')} />;
  }

  if (currentView === 'wwsc') {
    return <HtmlDashboard b64={WWSC_HTML_B64} title="WWSC Scorecard" onBack={() => setCurrentView('hub')} />;
  }

  if (currentView === 'flex') {
    return <UrlDashboard src="/flex.html" title="Pad Dispatch Tracker" onBack={() => setCurrentView('hub')} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-6 shadow-lg shadow-cyan-500/20">
            <BarChart3 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-3">Analytics Hub</h1>
          <p className="text-gray-400 text-lg">Select a platform to begin your deep dive</p>
          <p className="text-gray-600 text-sm mt-2">Created by Olatunji Eniola</p>
        </div>

        {/* Platform Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Concessions Analytics Card */}
          <button
            onClick={() => setCurrentView('concessions')}
            className="group bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 border border-slate-700 hover:border-cyan-500 transition-all duration-300 text-left hover:shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-1"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                <TrendingDown className="w-5 h-5 text-cyan-400" />
              </div>
              <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-cyan-400 transition-colors" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1.5 group-hover:text-cyan-400 transition-colors">Concessions Analytics</h2>
            <p className="text-gray-400 text-sm mb-3">DNR deep dive with sub-bucket analysis, coaching tips, and hierarchical pivot tables</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2.5 py-0.5 bg-cyan-900/30 text-cyan-400 rounded-full text-xs font-medium">Pivot Tables</span>
              <span className="px-2.5 py-0.5 bg-cyan-900/30 text-cyan-400 rounded-full text-xs font-medium">Coaching Tips</span>
              <span className="px-2.5 py-0.5 bg-cyan-900/30 text-cyan-400 rounded-full text-xs font-medium">Manager View</span>
            </div>
          </button>

          {/* Late Delivery Deep Dive Card */}
          <button
            onClick={() => setCurrentView('lateDelivery')}
            className="group bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 border border-slate-700 hover:border-orange-500 transition-all duration-300 text-left hover:shadow-lg hover:shadow-orange-500/10 hover:-translate-y-1"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                <Clock className="w-5 h-5 text-orange-400" />
              </div>
              <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-orange-400 transition-colors" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1.5 group-hover:text-orange-400 transition-colors">Late Delivery Deep Dive</h2>
            <p className="text-gray-400 text-sm mb-3">Root cause analysis for late deliveries with L2/L3 bucket breakdown, station analysis, and cost tracking</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2.5 py-0.5 bg-orange-900/30 text-orange-400 rounded-full text-xs font-medium">Root Cause</span>
              <span className="px-2.5 py-0.5 bg-orange-900/30 text-orange-400 rounded-full text-xs font-medium">Station Analysis</span>
              <span className="px-2.5 py-0.5 bg-orange-900/30 text-orange-400 rounded-full text-xs font-medium">Cost Tracking</span>
            </div>
          </button>

          {/* OTD Tracker Card */}
          <button
            onClick={() => setCurrentView('otd')}
            className="group bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 border border-slate-700 hover:border-emerald-500 transition-all duration-300 text-left hover:shadow-lg hover:shadow-emerald-500/10 hover:-translate-y-1"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                <LayoutGrid className="w-5 h-5 text-emerald-400" />
              </div>
              <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-emerald-400 transition-colors" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1.5 group-hover:text-emerald-400 transition-colors">OTD Tracker</h2>
            <p className="text-gray-400 text-sm mb-3">Live wave staging board with default cut times, color-coded waves, and automatic OTD% — shared across the team</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2.5 py-0.5 bg-emerald-900/30 text-emerald-400 rounded-full text-xs font-medium">Live Grid</span>
              <span className="px-2.5 py-0.5 bg-emerald-900/30 text-emerald-400 rounded-full text-xs font-medium">Auto OTD%</span>
              <span className="px-2.5 py-0.5 bg-emerald-900/30 text-emerald-400 rounded-full text-xs font-medium">Shared</span>
            </div>
          </button>

          {/* Warehouse Compliance (Watchtower) Card */}
          <button
            onClick={() => setCurrentView('watchtower')}
            className="group bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 border border-slate-700 hover:border-violet-500 transition-all duration-300 text-left hover:shadow-lg hover:shadow-violet-500/10 hover:-translate-y-1"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/20 transition-colors">
                <ShieldCheck className="w-5 h-5 text-violet-400" />
              </div>
              <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-violet-400 transition-colors" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1.5 group-hover:text-violet-400 transition-colors">Warehouse Compliance</h2>
            <p className="text-gray-400 text-sm mb-3">Watchtower compliance dashboard with regional rollups, daily tracking, and threshold scoring</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2.5 py-0.5 bg-violet-900/30 text-violet-400 rounded-full text-xs font-medium">Compliance</span>
              <span className="px-2.5 py-0.5 bg-violet-900/30 text-violet-400 rounded-full text-xs font-medium">By Region</span>
              <span className="px-2.5 py-0.5 bg-violet-900/30 text-violet-400 rounded-full text-xs font-medium">Daily Tracking</span>
            </div>
          </button>

          {/* WWSC Scorecard Card */}
          <button
            onClick={() => setCurrentView('wwsc')}
            className="group bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 border border-slate-700 hover:border-teal-500 transition-all duration-300 text-left hover:shadow-lg hover:shadow-teal-500/10 hover:-translate-y-1"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center group-hover:bg-teal-500/20 transition-colors">
                <Target className="w-5 h-5 text-teal-400" />
              </div>
              <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-teal-400 transition-colors" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1.5 group-hover:text-teal-400 transition-colors">WWSC Scorecard</h2>
            <p className="text-gray-400 text-sm mb-3">Opportunities scorecard grouped by pillar with performance metrics and trend views</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2.5 py-0.5 bg-teal-900/30 text-teal-400 rounded-full text-xs font-medium">By Pillar</span>
              <span className="px-2.5 py-0.5 bg-teal-900/30 text-teal-400 rounded-full text-xs font-medium">Scorecard</span>
              <span className="px-2.5 py-0.5 bg-teal-900/30 text-teal-400 rounded-full text-xs font-medium">Trends</span>
            </div>
          </button>

          {/* Pad Dispatch (Flex) Tracker Card */}
          <button
            onClick={() => setCurrentView('flex')}
            className="group bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 border border-slate-700 hover:border-amber-500 transition-all duration-300 text-left hover:shadow-lg hover:shadow-amber-500/10 hover:-translate-y-1"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                <Truck className="w-5 h-5 text-amber-400" />
              </div>
              <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-amber-400 transition-colors" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1.5 group-hover:text-amber-400 transition-colors">Pad Dispatch Tracker</h2>
            <p className="text-gray-400 text-sm mb-3">Live pad board — check-in fills routes and staging, auto dispatch and wave hand-off, shared by board name</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2.5 py-0.5 bg-amber-900/30 text-amber-400 rounded-full text-xs font-medium">Live Board</span>
              <span className="px-2.5 py-0.5 bg-amber-900/30 text-amber-400 rounded-full text-xs font-medium">Check-in</span>
              <span className="px-2.5 py-0.5 bg-amber-900/30 text-amber-400 rounded-full text-xs font-medium">By Station</span>
            </div>
          </button>
        </div>

        {/* Footer info */}
        <div className="mt-12 text-center">
          <p className="text-gray-600 text-sm">Upload your CSV data within each platform to get started</p>
        </div>
      </div>
    </div>
  );
}