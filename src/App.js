/*
Code created by Olatunji Eniola.
DSP PIVOT TABLE
*/
import React, { useState } from 'react';
import Papa from 'papaparse';
import _ from 'lodash';
import { Upload, AlertCircle, X, Plus, ChevronRight, ChevronDown, Download, Eye, EyeOff, Settings } from 'lucide-react';

export default function PivotTableApp() {
  // ===== STATE MANAGEMENT =====
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [selectedDSPs, setSelectedDSPs] = useState([]);
  
  /*
   * pivotConfig holds all the user's pivot table settings:
   * - rowField: The main grouping field (e.g., "Transporter ID")
   * - subRowField: Optional child grouping for hierarchical tables (e.g., "Tracking ID")
   *   When set, creates Excel-like nested rows where parent rows can expand/collapse
   * - valueFields: Array of {field, aggregation} pairs - what to calculate
   *   aggregation can be: count, sum, average, min, max, or 'value' (shows actual data)
   * - filters: Key-value pairs to filter data before pivoting
   * - compareField/compareValues: For side-by-side comparison tables
   */
  const [pivotConfig, setPivotConfig] = useState({
    rowField: '',
    subRowField: '',
    valueFields: [{ field: '', aggregation: 'count', showActualValues: false }],
    filters: {},
    compareField: '',
    compareValues: []
  });
  
  const [pivotTables, setPivotTables] = useState([]);
  const [highlightConfig, setHighlightConfig] = useState({
    condition: 'greater',
    value: '',
    color: 'yellow'  // 'yellow' for auto-highlight
  });
  
  // Config for green auto-highlight (improvements)
  const [greenHighlightConfig, setGreenHighlightConfig] = useState({
    condition: 'less',
    value: '',
    enabled: false
  });
  
  /*
   * manualHighlights tracks which cells the user has clicked to highlight.
   * Key format: "${dsp}-${rowKey}-${valueFieldIndex}" 
   * Value: 'orange' | 'green' | null (color of highlight)
   */
  const [manualHighlights, setManualHighlights] = useState({});
  
  // Track which manual highlight color is selected for clicking
  const [manualHighlightColor, setManualHighlightColor] = useState('orange');
  
  const [error, setError] = useState('');
  const [availableValues, setAvailableValues] = useState({});
  const [drillDownData, setDrillDownData] = useState(null);
  const [showDrillDown, setShowDrillDown] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  
  // Modal position and size for draggable/resizable drill-down
  const [modalPosition, setModalPosition] = useState({ x: 50, y: 50 });
  const [modalSize, setModalSize] = useState({ width: 90, height: 85 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  /*
   * expandedRows tracks which parent rows are expanded in hierarchical mode.
   * Key format: "${dsp}-${parentRowKey}"
   * Value: boolean (true = children are visible)
   */
  const [expandedRows, setExpandedRows] = useState({});
  
  // Manager View - collapsible section for overall data analysis
  const [showManagerView, setShowManagerView] = useState(false);

  // ===== FILE UPLOAD & PARSING =====
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
          
          /*
           * availableValues: Pre-compute unique values for each column
           * This powers the filter dropdowns - instead of scanning all data
           * every time a dropdown opens, we compute once on file load.
           * 
           * Example: { "Status": ["Delivered", "Pending"], "DSP": ["DSP1", "DSP2"] }
           */
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

  // ===== DSP & FILTER MANAGEMENT =====
  const toggleDSP = (dsp) => {
    if (selectedDSPs.includes(dsp)) {
      setSelectedDSPs(selectedDSPs.filter(d => d !== dsp));
    } else {
      setSelectedDSPs([...selectedDSPs, dsp]);
    }
  };

  const addFilter = (column) => {
    if (!pivotConfig.filters[column]) {
      setPivotConfig({
        ...pivotConfig,
        filters: { ...pivotConfig.filters, [column]: '' }
      });
    }
  };

  const updateFilter = (column, value) => {
    setPivotConfig({
      ...pivotConfig,
      filters: { ...pivotConfig.filters, [column]: value }
    });
  };

  const removeFilter = (column) => {
    const newFilters = { ...pivotConfig.filters };
    delete newFilters[column];
    setPivotConfig({ ...pivotConfig, filters: newFilters });
  };

  const toggleCompareValue = (value) => {
    const current = pivotConfig.compareValues;
    if (current.includes(value)) {
      setPivotConfig({
        ...pivotConfig,
        compareValues: current.filter(v => v !== value)
      });
    } else {
      setPivotConfig({
        ...pivotConfig,
        compareValues: [...current, value]
      });
    }
  };

  // ===== VALUE FIELD MANAGEMENT =====
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
      const newValueFields = pivotConfig.valueFields.filter((_, i) => i !== index);
      setPivotConfig({ ...pivotConfig, valueFields: newValueFields });
    }
  };

  // ===== AGGREGATION CALCULATION =====
  /*
   * calculateAggregation: Core function that computes values for pivot cells.
   * 
   * @param data - Array of row objects to aggregate
   * @param field - Column name to aggregate on
   * @param aggregation - Type: 'count', 'sum', 'average', 'min', 'max', or 'value'
   * 
   * The 'value' aggregation is special - it returns the actual cell content
   * instead of a calculated number. Useful when you want to see what's in the data
   * rather than a summary statistic.
   */
  const calculateAggregation = (data, field, aggregation) => {
    // Extract non-empty values from the specified field
    const values = data.map(row => row[field]).filter(v => v !== null && v !== undefined && v !== '');
    
    if (aggregation === 'count') {
      return values.length;
    }
    
    // 'value' aggregation: Return actual data instead of calculating
    // If multiple values exist, join them with commas
    if (aggregation === 'value') {
      if (values.length === 1) return values[0];
      return values.join(', ');
    }
    
    // For numeric aggregations, convert to numbers and filter out non-numeric
    const numValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (numValues.length === 0) return 0;
    
    switch (aggregation) {
      case 'sum':
        return _.sum(numValues);
      case 'average':
        return _.mean(numValues);
      case 'min':
        return _.min(numValues);
      case 'max':
        return _.max(numValues);
      default:
        return 0;
    }
  };

  // ===== HIERARCHICAL PIVOT TABLE CREATION =====
  const createPivotTables = () => {
    if (!pivotConfig.rowField) {
      setError('Please select a Row Field');
      return;
    }

    const hasValidValueField = pivotConfig.valueFields.some(vf => vf.field !== '');
    if (!hasValidValueField) {
      setError('Please select at least one Value Field');
      return;
    }

    if (selectedDSPs.length === 0) {
      setError('Please select at least one DSP');
      return;
    }

    try {
      const dspCol = columns.find(c => c.toLowerCase().includes('dsp'));
      const pivotResults = [];

      selectedDSPs.forEach(dsp => {
        let filteredData = data.filter(row => {
          if (!dspCol || row[dspCol] !== dsp) return false;

          for (let filterCol in pivotConfig.filters) {
            const filterValue = pivotConfig.filters[filterCol];
            if (filterValue && row[filterCol] !== filterValue) {
              return false;
            }
          }
          return true;
        });

        if (filteredData.length === 0) return;

        if (pivotConfig.subRowField) {
          /*
           * HIERARCHICAL MODE: Creates Excel-like nested pivot tables
           * 
           * Structure when subRowField is set (e.g., rowField="Transporter", subRowField="TrackingID"):
           * 
           * hierarchicalData = {
           *   "TransporterA": {
           *     values: { value_0: 100.5 },     // Aggregated total for this parent
           *     rawData: [...],                  // All rows for this parent (for drill-down)
           *     children: {
           *       "TBA123": { values: {...}, rawData: [...] },  // Child row 1
           *       "TBA456": { values: {...}, rawData: [...] }   // Child row 2
           *     }
           *   },
           *   "TransporterB": { ... }
           * }
           * 
           * This allows the UI to show collapsible parent rows with child rows underneath,
           * exactly like your Excel pivot table screenshot.
           */
          const grouped = _.groupBy(filteredData, row => row[pivotConfig.rowField] || 'Unknown');
          const hierarchicalData = {};

          Object.keys(grouped).forEach(parentKey => {
            const parentGroupData = grouped[parentKey];
            // Group the parent's data by the sub-row field to create children
            const childGroups = _.groupBy(parentGroupData, row => row[pivotConfig.subRowField] || 'Unknown');
            
            hierarchicalData[parentKey] = {
              values: {},
              rawData: parentGroupData,
              children: {}
            };

            // Calculate parent-level aggregations (totals across all children)
            pivotConfig.valueFields.forEach((vf, index) => {
              if (vf.field) {
                const value = calculateAggregation(parentGroupData, vf.field, vf.aggregation);
                hierarchicalData[parentKey].values[`value_${index}`] = value;
              }
            });

            // Calculate child-level aggregations (individual breakdown)
            Object.keys(childGroups).forEach(childKey => {
              const childGroupData = childGroups[childKey];
              hierarchicalData[parentKey].children[childKey] = {
                values: {},
                rawData: childGroupData
              };

              pivotConfig.valueFields.forEach((vf, index) => {
                if (vf.field) {
                  const value = calculateAggregation(childGroupData, vf.field, vf.aggregation);
                  hierarchicalData[parentKey].children[childKey].values[`value_${index}`] = value;
                }
              });
            });
          });

          pivotResults.push({
            dsp: dsp,
            data: hierarchicalData,
            isHierarchical: true,
            isComparison: false
          });
        } else if (pivotConfig.compareField && pivotConfig.compareValues.length > 0) {
          /*
           * COMPARISON MODE: Creates side-by-side tables for comparing different values
           * 
           * Example: If compareField="Week" and compareValues=["Week 1", "Week 2"]
           * This will create separate tables for Week 1 and Week 2 data,
           * displayed side-by-side so you can easily compare the same rows across different time periods.
           * 
           * allRowKeys collects all unique row keys across all comparison values
           * so that all tables show the same rows (even if a row is missing in one week)
           */
          const allRowKeys = new Set();
          const compareData = {};

          pivotConfig.compareValues.forEach(compareVal => {
            let compFilteredData = filteredData.filter(row => row[pivotConfig.compareField] === compareVal);

            const grouped = _.groupBy(compFilteredData, row => row[pivotConfig.rowField] || 'Unknown');
            compareData[compareVal] = {};
            
            Object.keys(grouped).forEach(rowKey => {
              allRowKeys.add(rowKey);
              const groupData = grouped[rowKey];
              compareData[compareVal][rowKey] = {
                values: {},
                rawData: groupData
              };
              
              pivotConfig.valueFields.forEach((vf, index) => {
                if (vf.field) {
                  const value = calculateAggregation(groupData, vf.field, vf.aggregation);
                  compareData[compareVal][rowKey].values[`value_${index}`] = value;
                }
              });
            });
          });

          pivotResults.push({
            dsp: dsp,
            data: compareData,
            rowKeys: Array.from(allRowKeys),
            isComparison: true,
            isHierarchical: false
          });
        } else {
          // STANDARD MODE
          const grouped = _.groupBy(filteredData, row => row[pivotConfig.rowField] || 'Unknown');
          const pivotData = {};

          Object.keys(grouped).forEach(rowKey => {
            const groupData = grouped[rowKey];
            pivotData[rowKey] = {
              values: {},
              rawData: groupData
            };
            
            pivotConfig.valueFields.forEach((vf, index) => {
              if (vf.field) {
                const value = calculateAggregation(groupData, vf.field, vf.aggregation);
                pivotData[rowKey].values[`value_${index}`] = value;
              }
            });
          });

          pivotResults.push({
            dsp: dsp,
            data: pivotData,
            isComparison: false,
            isHierarchical: false
          });
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

  // ===== HIGHLIGHTING =====
  
  // Check if value should be auto-highlighted yellow (attention/issues)
  const shouldHighlightYellow = (value) => {
    if (!highlightConfig.value || highlightConfig.value === '') return false;
    
    const numValue = parseFloat(value);
    const threshold = parseFloat(highlightConfig.value);
    
    if (isNaN(numValue) || isNaN(threshold)) return false;

    switch (highlightConfig.condition) {
      case 'greater':
        return numValue > threshold;
      case 'less':
        return numValue < threshold;
      case 'equal':
        return numValue === threshold;
      default:
        return false;
    }
  };
  
  // Check if value should be auto-highlighted green (improvements)
  const shouldHighlightGreen = (value) => {
    if (!greenHighlightConfig.enabled || !greenHighlightConfig.value || greenHighlightConfig.value === '') return false;
    
    const numValue = parseFloat(value);
    const threshold = parseFloat(greenHighlightConfig.value);
    
    if (isNaN(numValue) || isNaN(threshold)) return false;

    switch (greenHighlightConfig.condition) {
      case 'greater':
        return numValue > threshold;
      case 'less':
        return numValue < threshold;
      case 'equal':
        return numValue === threshold;
      default:
        return false;
    }
  };

  /*
   * toggleManualHighlight: Handles click-to-highlight functionality
   * 
   * @param cellId - Unique identifier for the cell (format: "dsp-rowKey-valueIndex")
   * @param e - Click event (we stop propagation to prevent row expansion in hierarchical mode)
   * 
   * Now supports cycling through colors: none -> orange -> green -> none
   * Or if a specific color is selected, toggles that color on/off
   */
  const toggleManualHighlight = (cellId, e) => {
    e.preventDefault();
    e.stopPropagation();
    setManualHighlights(prev => {
      const currentColor = prev[cellId];
      let newColor;
      
      if (manualHighlightColor === 'cycle') {
        // Cycle through: none -> orange -> green -> none
        if (!currentColor) newColor = 'orange';
        else if (currentColor === 'orange') newColor = 'green';
        else newColor = null;
      } else {
        // Toggle specific color on/off
        if (currentColor === manualHighlightColor) {
          newColor = null;
        } else {
          newColor = manualHighlightColor;
        }
      }
      
      return {
        ...prev,
        [cellId]: newColor
      };
    });
  };

  const getAggregationLabel = (agg) => {
    const labels = {
      count: 'Count',
      sum: 'Sum',
      average: 'Avg',
      min: 'Min',
      max: 'Max',
      value: 'Value'
    };
    return labels[agg] || 'Value';
  };

  /*
   * getHighlightClass: Determines the CSS class for a cell based on highlight state
   * 
   * Priority:
   * 1. Manual highlight (orange or green based on user selection)
   * 2. Auto green highlight (improvements)
   * 3. Auto yellow highlight (attention/issues)
   * 4. No highlight
   */
  const getHighlightClass = (value, cellId) => {
    const manualColor = manualHighlights[cellId];
    
    if (manualColor === 'orange') {
      return 'bg-amber-500 text-black font-bold';
    }
    if (manualColor === 'green') {
      return 'bg-green-500 text-black font-bold';
    }
    if (shouldHighlightGreen(value)) {
      return 'bg-green-400 text-black font-bold';
    }
    if (shouldHighlightYellow(value)) {
      return 'bg-yellow-400 text-black font-bold';
    }
    return '';
  };
  
  /*
   * getRowLabelHighlightClass: Determines the CSS class for row label cells
   * Row labels only support manual highlighting (not auto)
   */
  const getRowLabelHighlightClass = (cellId) => {
    const manualColor = manualHighlights[cellId];
    
    if (manualColor === 'orange') {
      return 'bg-amber-500 text-black';
    }
    if (manualColor === 'green') {
      return 'bg-green-500 text-black';
    }
    return '';
  };

  /*
   * generateSummaryStatement: Creates a manager-style comparison summary
   * 
   * Compares performance between time periods (weeks, etc.) and includes:
   * - Improvement or decline analysis
   * - Total dollar amount (Gross Concession USD) if available
   * - POD (Photo on Delivery) stats if available
   * - Average scan distance if available
   * - Concession date range if available
   * 
   * Dynamically adapts based on what columns exist in the data and what's selected
   */
  const generateSummaryStatement = (pivot) => {
    const valueField = pivotConfig.valueFields[0];
    if (!valueField || !valueField.field) return '';
    
    // Helper to format currency
    const formatCurrency = (val) => {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    };
    
    // Helper to find column by partial name match (case-insensitive)
    const findColumn = (searchTerms) => {
      return columns.find(col => 
        searchTerms.some(term => col.toLowerCase().includes(term.toLowerCase()))
      );
    };
    
    // Sub Bucket coaching tips - based on actual defect definitions with actionable coaching
    const subBucketCoaching = {
      // Scanning Issues
      'speedy scanning': 'Def: Swiped to finish within 20 sec of another delivery (2x DNR risk). Action: Complete one delivery at a time. Wait 10+ sec between swipes.',
      'speedy': 'Def: Swiped to finish within 20 sec of another delivery. Action: One piece flow - complete each delivery fully before starting next.',
      
      // Device/Location Issues  
      'device >50 meters': 'Def: Package scanned >50m from delivery GPS point. Action: Coach driver to scan at actual delivery location, not from vehicle.',
      'device': 'Def: Scan location didn\'t match delivery point. Action: Ensure driver scans package at the door, not in vehicle or street.',
      '50 meters': 'Def: Scanned too far from delivery location. Action: Coach proper scan location - at the delivery point.',
      
      // Behavioral/Root Cause Issues
      'driver behavior': 'Def: DNR attributed to driver actions/patterns. Action: Review scan timing, photo quality, and delivery sequence. Coach on standard work.',
      'behavior': 'Def: Driver pattern contributed to DNR. Action: Deep dive delivery practices, identify specific behavior to correct.',
      'no attribution': 'Def: No single root cause identified. Action: Review distance, timing, POD, and circumstantial signals to find patterns.',
      'no root cause': 'Def: Cannot determine specific cause. Action: Look at all available data points for this driver.',
      
      // Customer Service Issues
      'cs misattribution': 'Def: DNR may be incorrectly attributed via CS ticket. Action: Review original ticket, may need data correction.',
      'misattribution': 'Def: Possible incorrect attribution. Action: Verify if DNR correctly belongs to this driver/delivery.',
      'customer': 'Def: Customer-initiated complaint. Action: Review delivery photo, instructions, and customer history.',
      
      // Address/Location Pattern Issues
      'repeat address': 'Def: Address with multiple DNRs in last 30 days. Action: Deep dive, submit FQA ticket for customer pattern analysis.',
      'egregious zip': 'Def: Delivery in zipcode with higher than normal DPMO. Action: Investigate area root cause, review with all affected drivers.',
      
      // Timing Issues
      'outside business hours': 'Def: Delivery completed outside marked business hours. Action: Verify timing - may indicate interception risk or wrong location.',
      'business hours': 'Def: Delivered when business was closed. Action: Check delivery instructions and business operating hours.',
      
      // Training/New Driver Issues
      'nursery route': 'Def: DNR on route assigned to driver in training (LC DA). Action: Ensure trainee stays on assigned route, provide pre-route quality reminders.',
      'nursery': 'Def: New driver issue. Action: Additional coaching and ride-along if needed.',
      
      // Group Stop Issues
      'group stop': 'Def: DNR at group stop where multiple packages swiped together. Action: Coach to check each label individually, verify address before leaving.',
      'group': 'Def: Multi-package stop error. Action: Standard work - one package at a time, verify each label.',
      
      // Geo/Feed Issues
      'geo': 'Def: Geopoint mismatch between scan and delivery location. Action: Contact support if recurring, verify correct address.',
      'cdf feed': 'Def: Data feed issue (chatbot signal coming soon). Action: May be system issue, document for support.',
      
      // Photo/POD Issues
      'no pod': 'Def: No Photo on Delivery captured. Action: Coach to always take clear photo showing package and surroundings.',
      'pod': 'Def: Photo on Delivery issue. Action: Ensure photo clearly shows package placement and address identifier.',
      'photo': 'Def: Missing or unclear delivery photo. Action: Take photo showing package, surroundings, and address when possible.',
      
      // Delivery Method Issues
      'doorstep': 'Def: Left at doorstep but DNR occurred. Action: Ensure secure placement, avoid visible locations, use delivery instructions.',
      'household member': 'Def: Handed to person at address. Action: When possible, verify recipient and note description.',
      'household': 'Def: Given to household member. Action: Confirm recipient awareness.',
      
      // Recipient Type Issues
      'clerk': 'Def: Delivered to store/building clerk. Action: Get name, verify they can receive packages for customer.',
      'guard': 'Def: Delivered to security guard. Action: Get guard name/ID and confirmation.',
      'receptionist': 'Def: Delivered to front desk. Action: Get receptionist name and log delivery.',
      'concierge': 'Def: Given to building concierge. Action: Ensure concierge logs receipt, get name.',
      'mailroom': 'Def: Left in mailroom (apartments, offices). Action: Follow standard work, check labels, deliver to correct unit if possible.',
      
      // Theft/Security Issues
      'porch piracy': 'Def: Package stolen after delivery. Action: Review photo, timing, and placement. Consider secure location options.',
      'piracy': 'Def: Theft suspected post-delivery. Action: Verify photo shows secure placement.',
      'stolen': 'Def: Package reported stolen. Action: Check delivery photo quality and placement.',
      
      // Delivery Errors
      'misdelivered': 'Def: Package delivered to wrong address. Action: Reinforce label verification at every stop.',
      'wrong address': 'Def: Incorrect delivery location. Action: Coach on checking address before leaving.',
      'missing': 'Def: Item missing from package/shipment. Action: Review handling, may be upstream issue.',
      
      // High Value
      'high value item': 'Def: DNR on package worth >$xx. Action: Prioritize coaching, review all behavioral signals.',
      'high value': 'Def: High-value package DNR. Action: Ensure photo, secure placement, and recipient verification when possible.',
      
      // Sync/System Issues
      'sds': 'Def: Marked by SDS (airplane mode/cell service sync issue). Action: Ensure drivers sync device when back online.',
      'sync': 'Def: Device didn\'t sync properly. Action: Coach on syncing device regularly, especially after offline periods.',
      
      // Other
      'partner': 'Def: Partner-related attribution. Action: Review with appropriate team.',
      'access': 'Def: Could not access delivery location. Action: Note access codes/instructions for future.',
      'weather': 'Def: Weather may have been factor. Action: Document conditions, ensure secure placement in bad weather.'
    };
    
    // Function to analyze sub buckets from raw data and return coaching tips
    const analyzeSubBuckets = (rawDataArray) => {
      if (!rawDataArray || rawDataArray.length === 0) return [];
      
      // Find sub bucket column
      const subBucketCol = findColumn(['sub bucket', 'sub_bucket', 'subbucket', 'bucket', 'defect type', 'defect_type', 'issue type', 'issue_type', 'reason', 'dnr reason']);
      if (!subBucketCol) return [];
      
      // Count occurrences of each sub bucket
      const bucketCounts = {};
      rawDataArray.forEach(row => {
        const bucket = row[subBucketCol];
        if (bucket && bucket.toString().trim()) {
          const key = bucket.toString().trim();
          bucketCounts[key] = (bucketCounts[key] || 0) + 1;
        }
      });
      
      // Sort by count and get top sub buckets
      const sortedBuckets = Object.entries(bucketCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      // Map to coaching tips
      const tips = [];
      sortedBuckets.forEach(([bucket, count]) => {
        const bucketLower = bucket.toLowerCase();
        // Find matching coaching tip
        for (const [key, tip] of Object.entries(subBucketCoaching)) {
          if (bucketLower.includes(key) || key.includes(bucketLower)) {
            tips.push({ bucket, count, tip });
            break;
          }
        }
        // If no specific tip found, add generic entry
        if (!tips.find(t => t.bucket === bucket)) {
          tips.push({ bucket, count, tip: null });
        }
      });
      
      return tips;
    };
    
    // Identify key columns in the data
    const grossConcessionCol = findColumn(['gross concession', 'concession usd', 'gross_concession', 'amount', 'usd']);
    const podCol = findColumn(['pod', 'photo on delivery', 'photo_on_delivery']);
    const scanDistanceCol = findColumn(['scan distance', 'scan_distance', 'distance']);
    const concessionDateCol = findColumn(['concession date', 'concession_date']);
    const deliveryDateCol = findColumn(['delivery date', 'delivery_date', 'actual delivery']);
    
    // Helper to calculate metrics from raw data array
    const calculateMetrics = (rawDataArray) => {
      if (!rawDataArray || rawDataArray.length === 0) return null;
      
      const metrics = {
        count: rawDataArray.length
      };
      
      // Gross Concession USD
      if (grossConcessionCol) {
        const values = rawDataArray.map(r => parseFloat(r[grossConcessionCol])).filter(v => !isNaN(v));
        metrics.totalConcession = values.reduce((sum, v) => sum + v, 0);
      }
      
      // POD stats
      if (podCol) {
        const podValues = rawDataArray.map(r => r[podCol]).filter(v => v !== null && v !== undefined && v !== '');
        const withPod = podValues.filter(v => 
          v.toString().toLowerCase() === 'yes' || 
          v.toString().toLowerCase() === 'true' || 
          v.toString() === '1' ||
          v.toString().toLowerCase() === 'y'
        ).length;
        metrics.podRate = podValues.length > 0 ? (withPod / podValues.length * 100) : 0;
        metrics.podCount = withPod;
        metrics.noPodCount = podValues.length - withPod;
      }
      
      // Scan Distance
      if (scanDistanceCol) {
        const distances = rawDataArray.map(r => parseFloat(r[scanDistanceCol])).filter(v => !isNaN(v));
        metrics.avgScanDistance = distances.length > 0 ? distances.reduce((sum, v) => sum + v, 0) / distances.length : 0;
        metrics.totalScanDistance = distances.reduce((sum, v) => sum + v, 0);
      }
      
      // Date range
      if (concessionDateCol) {
        const dates = rawDataArray.map(r => r[concessionDateCol]).filter(v => v).sort();
        if (dates.length > 0) {
          metrics.dateRange = { start: dates[0], end: dates[dates.length - 1] };
        }
      }
      
      // Delivery date range (side note info)
      if (deliveryDateCol) {
        const deliveryDates = rawDataArray.map(r => r[deliveryDateCol]).filter(v => v).sort();
        if (deliveryDates.length > 0) {
          metrics.deliveryDateRange = { start: deliveryDates[0], end: deliveryDates[deliveryDates.length - 1] };
        }
      }
      
      return metrics;
    };
    
    // ===== COMPARISON MODE: Compare between periods =====
    if (pivot.isComparison && pivotConfig.compareValues.length >= 2) {
      const periods = pivotConfig.compareValues;
      const periodData = {};
      
      // Calculate metrics for each period
      periods.forEach(period => {
        const data = pivot.data[period];
        if (!data) return;
        
        // Combine all raw data from this period
        const allRawData = Object.values(data).flatMap(d => d.rawData || []);
        const sorted = Object.keys(data)
          .map(key => ({ name: key, value: data[key].values?.value_0 || 0, rawData: data[key].rawData }))
          .sort((a, b) => b.value - a.value);
        
        periodData[period] = {
          total: sorted.reduce((sum, r) => sum + r.value, 0),
          count: Object.keys(data).length,
          topOffenders: sorted.slice(0, 3),
          allOffenders: sorted.map(s => s.name),
          metrics: calculateMetrics(allRawData)
        };
      });
      
      // Compare first two periods
      const [period1, period2] = periods;
      const data1 = periodData[period1];
      const data2 = periodData[period2];
      
      if (!data1 || !data2) return '';
      
      // Find repeat offenders (appear in both periods)
      const repeatOffenders = data1.allOffenders.filter(name => data2.allOffenders.includes(name));
      const topRepeatOffenders = repeatOffenders.filter(name => 
        data1.topOffenders.some(t => t.name === name) || data2.topOffenders.some(t => t.name === name)
      ).slice(0, 5);
      
      const diff = data1.total - data2.total;
      const percentChange = data2.total > 0 ? ((diff / data2.total) * 100).toFixed(1) : 0;
      const improved = diff < 0;
      
      // Build the statement
      let statement = '';
      
      if (improved) {
        statement = `📈 Great improvement! Your team saw a ${Math.abs(percentChange)}% reduction from ${period2} to ${period1}. `;
      } else if (diff > 0) {
        statement = `📉 Attention needed: Your team saw a ${Math.abs(percentChange)}% increase from ${period2} to ${period1}. `;
      } else {
        statement = `➡️ Performance remained steady between ${period2} and ${period1}. `;
      }
      
      // Add top offenders
      const topNames = data1.topOffenders.slice(0, 3).map(t => t.name).join(', ');
      statement += `Top offenders in ${period1}: ${topNames}. `;
      
      // Add repeat offenders info
      if (topRepeatOffenders.length > 0) {
        statement += `\n⚠️ Repeat offenders (appear in both ${period1} and ${period2}): ${topRepeatOffenders.join(', ')}. `;
      } else if (repeatOffenders.length > 0) {
        statement += `\n⚠️ ${repeatOffenders.length} ${pivotConfig.rowField}(s) appear in both periods. `;
      }
      
      // Add dollar amount if available
      if (data1.metrics?.totalConcession !== undefined) {
        const concessionDiff = (data1.metrics.totalConcession || 0) - (data2.metrics?.totalConcession || 0);
        statement += `Total concession cost: ${formatCurrency(data1.metrics.totalConcession)}`;
        if (concessionDiff !== 0) {
          statement += ` (${concessionDiff < 0 ? '↓' : '↑'}${formatCurrency(Math.abs(concessionDiff))} vs ${period2})`;
        }
        statement += '. ';
      }
      
      // Add POD info if available
      if (data1.metrics?.podRate !== undefined) {
        statement += `POD rate: ${data1.metrics.podRate.toFixed(1)}% (${data1.metrics.noPodCount} missing POD). `;
      }
      
      // Add scan distance if available
      if (data1.metrics?.avgScanDistance !== undefined) {
        statement += `Avg scan distance: ${data1.metrics.avgScanDistance.toFixed(1)}m. `;
      }
      
      // Add date range as side note if available
      if (data1.metrics?.dateRange) {
        statement += `\n📅 Concessions placed: ${data1.metrics.dateRange.start} to ${data1.metrics.dateRange.end}.`;
      }
      
      // Add delivery date range as side note if available
      if (data1.metrics?.deliveryDateRange) {
        statement += ` Actual deliveries: ${data1.metrics.deliveryDateRange.start} to ${data1.metrics.deliveryDateRange.end}.`;
      }
      
      // Add sub bucket coaching tips
      const allRawData1 = Object.values(pivot.data[period1] || {}).flatMap(d => d.rawData || []);
      const coachingTips = analyzeSubBuckets(allRawData1);
      if (coachingTips.length > 0) {
        statement += `\n\n🔧 Coaching Focus Areas:`;
        coachingTips.forEach(({ bucket, count, tip }) => {
          statement += `\n• ${bucket} (${count}): ${tip || 'Review with driver for root cause.'}`;
        });
      }
      
      return statement;
      
    } else if (pivot.isHierarchical || !pivot.isComparison) {
      // ===== STANDARD/HIERARCHICAL MODE: Single period summary =====
      const allData = pivot.isHierarchical ? pivot.data : pivot.data;
      
      // Get all raw data combined
      const allRawData = Object.values(allData).flatMap(d => d.rawData || []);
      const metrics = calculateMetrics(allRawData);
      
      // Find a numeric value field to use for sorting/percentage (skip 'value' aggregation)
      let numericValueIndex = -1;
      for (let i = 0; i < pivotConfig.valueFields.length; i++) {
        const vf = pivotConfig.valueFields[i];
        if (vf.field && vf.aggregation !== 'value') {
          numericValueIndex = i;
          break;
        }
      }
      
      // Get top offenders
      const sorted = Object.keys(allData)
        .map(key => {
          let numValue = 0;
          if (numericValueIndex >= 0) {
            numValue = allData[key].values?.[`value_${numericValueIndex}`] || 0;
          } else {
            // No numeric field, use raw data count as fallback
            numValue = allData[key].rawData?.length || 0;
          }
          return { 
            name: key, 
            value: typeof numValue === 'number' ? numValue : 0,
            recordCount: allData[key].rawData?.length || 0
          };
        })
        .sort((a, b) => b.value - a.value);
      
      const topThree = sorted.slice(0, 3);
      const total = sorted.reduce((sum, r) => sum + r.value, 0);
      const topThreeTotal = topThree.reduce((sum, r) => sum + r.value, 0);
      const topThreePercent = total > 0 ? ((topThreeTotal / total) * 100).toFixed(1) : 0;
      
      // Build statement
      let statement = `📊 Overview: ${sorted.length} ${pivotConfig.rowField}(s) found. `;
      
      // Top offenders - format based on whether we have numeric values
      if (numericValueIndex >= 0 && total > 0) {
        // We have a numeric field to show
        const numericField = pivotConfig.valueFields[numericValueIndex];
        const topNames = topThree.map(t => `${t.name} (${t.value.toFixed(2)})`).join(', ');
        statement += `Top offenders: ${topNames} — accounting for ${topThreePercent}% of total ${getAggregationLabel(numericField.aggregation).toLowerCase()}. `;
      } else {
        // No numeric field or all zeros - just show names with record counts
        const topNames = topThree.map(t => `${t.name} (${t.recordCount} records)`).join(', ');
        statement += `Top ${pivotConfig.rowField}s: ${topNames}. `;
      }
      
      // Add dollar amount if available
      if (metrics?.totalConcession !== undefined) {
        statement += `Total concession cost: ${formatCurrency(metrics.totalConcession)}. `;
      }
      
      // Add POD info if available
      if (metrics?.podRate !== undefined) {
        statement += `POD rate: ${metrics.podRate.toFixed(1)}% (${metrics.noPodCount} deliveries missing POD). `;
      }
      
      // Add scan distance if available
      if (metrics?.avgScanDistance !== undefined) {
        statement += `Avg scan distance: ${metrics.avgScanDistance.toFixed(1)} meters. `;
      }
      
      // Add date range as side note if available
      if (metrics?.dateRange) {
        statement += `\n📅 Concessions placed: ${metrics.dateRange.start} to ${metrics.dateRange.end}.`;
      }
      
      // Add delivery date range as side note if available
      if (metrics?.deliveryDateRange) {
        statement += ` Actual deliveries: ${metrics.deliveryDateRange.start} to ${metrics.deliveryDateRange.end}.`;
      }
      
      // Add sub bucket coaching tips
      const coachingTips = analyzeSubBuckets(allRawData);
      if (coachingTips.length > 0) {
        statement += `\n\n🔧 Coaching Focus Areas:`;
        coachingTips.forEach(({ bucket, count, tip }) => {
          statement += `\n• ${bucket} (${count}): ${tip || 'Review with driver for root cause.'}`;
        });
      }
      
      return statement;
    }
    
    return '';
  };

  // ===== MANAGER VIEW ANALYSIS =====
  /*
   * generateManagerViewData: Analyzes ALL uploaded data for manager-level insights
   * Returns an object with:
   * - subBucketAnalysis: All sub buckets ranked by count with definitions and fixes
   * - costAnalysis: Sub buckets ranked by total cost impact
   * - driverAnalysis: Top repeat offender drivers across all DSPs
   * - dspAnalysis: DSPs ranked by issue count
   * - weekOverWeekTrends: Comparison if multiple periods selected
   */
  const generateManagerViewData = () => {
    if (!data || data.length === 0) return null;
    
    // Helper to find column by partial name match - prioritizes exact matches
    const findColumn = (searchTerms) => {
      // First try exact match (case-insensitive)
      for (const term of searchTerms) {
        const exactMatch = columns.find(col => col.toLowerCase() === term.toLowerCase());
        if (exactMatch) return exactMatch;
      }
      // Then try includes match
      for (const term of searchTerms) {
        const partialMatch = columns.find(col => col.toLowerCase().includes(term.toLowerCase()));
        if (partialMatch) return partialMatch;
      }
      return null;
    };
    
    // Identify key columns
    const subBucketCol = findColumn(['sub bucket', 'sub_bucket', 'subbucket', 'bucket', 'defect type', 'defect_type', 'issue type', 'issue_type', 'reason', 'dnr reason']);
    const dspCol = findColumn(['dsp']);
    const transporterCol = findColumn(['transporter id', 'transporter_id', 'transporterid', 'da id', 'da_id', 'driver id', 'driver_id']);
    const concessionCol = findColumn(['gross concession', 'concession usd', 'gross_concession', 'amount', 'usd', 'cost']);
    const weekCol = findColumn(['concession year week', 'year week', 'week', 'period']);
    
    // Sub Bucket coaching definitions (same as in generateSummaryStatement)
    const subBucketCoaching = {
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
      'weather': 'Def: Weather may have been factor. Action: Document conditions, ensure secure placement in bad weather.'
    };
    
    // Helper to get coaching tip for a bucket
    const getCoachingTip = (bucket) => {
      if (!bucket) return 'Review with driver for root cause.';
      const bucketLower = bucket.toLowerCase();
      for (const [key, tip] of Object.entries(subBucketCoaching)) {
        if (bucketLower.includes(key) || key.includes(bucketLower)) {
          return tip;
        }
      }
      return 'Review with driver for root cause.';
    };
    
    // 1. SUB BUCKET ANALYSIS - Count and rank all sub buckets
    const subBucketCounts = {};
    const subBucketCosts = {};
    
    data.forEach(row => {
      if (subBucketCol) {
        const bucket = row[subBucketCol];
        if (bucket && bucket.toString().trim()) {
          const key = bucket.toString().trim();
          subBucketCounts[key] = (subBucketCounts[key] || 0) + 1;
          
          // Track cost per bucket
          if (concessionCol) {
            const cost = parseFloat(row[concessionCol]) || 0;
            subBucketCosts[key] = (subBucketCosts[key] || 0) + cost;
          }
        }
      }
    });
    
    const subBucketAnalysis = Object.entries(subBucketCounts)
      .map(([bucket, count]) => ({
        bucket,
        count,
        cost: subBucketCosts[bucket] || 0,
        percentage: ((count / data.length) * 100).toFixed(1),
        tip: getCoachingTip(bucket)
      }))
      .sort((a, b) => b.count - a.count);
    
    // 2. COST ANALYSIS - Same data but sorted by cost
    const costAnalysis = [...subBucketAnalysis]
      .filter(item => item.cost > 0)
      .sort((a, b) => b.cost - a.cost);
    
    // 3. DRIVER ANALYSIS - Top repeat offender drivers
    const driverCounts = {};
    const driverCosts = {};
    const driverDSPs = {};
    
    data.forEach(row => {
      if (transporterCol) {
        const driver = row[transporterCol];
        if (driver && driver.toString().trim()) {
          const key = driver.toString().trim();
          driverCounts[key] = (driverCounts[key] || 0) + 1;
          
          if (concessionCol) {
            const cost = parseFloat(row[concessionCol]) || 0;
            driverCosts[key] = (driverCosts[key] || 0) + cost;
          }
          
          if (dspCol && row[dspCol]) {
            driverDSPs[key] = row[dspCol];
          }
        }
      }
    });
    
    const driverAnalysis = Object.entries(driverCounts)
      .map(([driver, count]) => ({
        driver,
        count,
        cost: driverCosts[driver] || 0,
        dsp: driverDSPs[driver] || 'Unknown',
        percentage: ((count / data.length) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Top 20 drivers
    
    // 4. DSP ANALYSIS - DSPs ranked by issue count
    const dspCounts = {};
    const dspCosts = {};
    
    data.forEach(row => {
      if (dspCol) {
        const dsp = row[dspCol];
        if (dsp && dsp.toString().trim()) {
          const key = dsp.toString().trim();
          dspCounts[key] = (dspCounts[key] || 0) + 1;
          
          if (concessionCol) {
            const cost = parseFloat(row[concessionCol]) || 0;
            dspCosts[key] = (dspCosts[key] || 0) + cost;
          }
        }
      }
    });
    
    const dspAnalysis = Object.entries(dspCounts)
      .map(([dsp, count]) => ({
        dsp,
        count,
        cost: dspCosts[dsp] || 0,
        percentage: ((count / data.length) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count);
    
    // 5. WEEK OVER WEEK TRENDS (if week column exists)
    let weekTrends = [];
    if (weekCol) {
      const weekCounts = {};
      const weekCosts = {};
      
      data.forEach(row => {
        const week = row[weekCol];
        if (week && week.toString().trim()) {
          const key = week.toString().trim();
          weekCounts[key] = (weekCounts[key] || 0) + 1;
          
          if (concessionCol) {
            const cost = parseFloat(row[concessionCol]) || 0;
            weekCosts[key] = (weekCosts[key] || 0) + cost;
          }
        }
      });
      
      weekTrends = Object.entries(weekCounts)
        .map(([week, count]) => ({
          week,
          count,
          cost: weekCosts[week] || 0
        }))
        .sort((a, b) => a.week.localeCompare(b.week));
    }
    
    // 6. DRIVER TENURE ANALYSIS
    const tenureCol = findColumn(['driver tenure', 'tenure', 'driver tenure weeks']);
    let tenureAnalysis = [];
    
    if (tenureCol) {
      const tenureCounts = {};
      const tenureCosts = {};
      
      data.forEach(row => {
        const tenure = row[tenureCol];
        if (tenure !== null && tenure !== undefined && tenure !== '') {
          const tenureNum = parseFloat(tenure);
          let tenureGroup;
          
          // Group tenure into categories
          if (isNaN(tenureNum)) {
            tenureGroup = tenure.toString().trim(); // Use as-is if not a number
          } else if (tenureNum >= 10) {
            tenureGroup = 'Week 10+';
          } else if (tenureNum >= 5) {
            tenureGroup = 'Week 5-9';
          } else if (tenureNum >= 1) {
            tenureGroup = 'Week 1-4';
          } else {
            tenureGroup = 'Week 0 (New)';
          }
          
          tenureCounts[tenureGroup] = (tenureCounts[tenureGroup] || 0) + 1;
          
          if (concessionCol) {
            const cost = parseFloat(row[concessionCol]) || 0;
            tenureCosts[tenureGroup] = (tenureCosts[tenureGroup] || 0) + cost;
          }
        }
      });
      
      const totalForPercent = Object.values(tenureCounts).reduce((sum, c) => sum + c, 0);
      
      tenureAnalysis = Object.entries(tenureCounts)
        .map(([tenure, count]) => ({
          tenure,
          count,
          cost: tenureCosts[tenure] || 0,
          percentage: totalForPercent > 0 ? ((count / totalForPercent) * 100).toFixed(1) : 0
        }))
        .sort((a, b) => b.count - a.count);
    }
    
    // 7. SUMMARY STATS
    // Filter out empty rows - a row is valid if it has at least one non-empty value
    const validData = data.filter(row => {
      return Object.values(row).some(val => val !== null && val !== undefined && val !== '');
    });
    
    const totalConcessions = validData.length;
    const totalCost = concessionCol 
      ? validData.reduce((sum, row) => sum + (parseFloat(row[concessionCol]) || 0), 0)
      : 0;
    const uniqueDrivers = transporterCol 
      ? new Set(validData.map(row => row[transporterCol]).filter(v => v)).size
      : 0;
    const uniqueDSPs = dspCol
      ? new Set(validData.map(row => row[dspCol]).filter(v => v)).size
      : 0;
    
    // Get weeks found for debugging
    const weeksFound = weekCol 
      ? [...new Set(validData.map(row => row[weekCol]).filter(v => v))].sort()
      : [];
    
    return {
      subBucketAnalysis,
      costAnalysis,
      driverAnalysis,
      dspAnalysis,
      weekTrends,
      tenureAnalysis,
      summary: {
        totalConcessions,
        totalCost,
        uniqueDrivers,
        uniqueDSPs,
        avgCostPerConcession: totalConcessions > 0 ? totalCost / totalConcessions : 0,
        weeksFound,
        rawRowCount: data.length // For debugging - shows original row count
      },
      columns: {
        hasSubBucket: !!subBucketCol,
        subBucketColName: subBucketCol || 'Not found',
        hasCost: !!concessionCol,
        costColName: concessionCol || 'Not found',
        hasDriver: !!transporterCol,
        driverColName: transporterCol || 'Not found',
        hasDSP: !!dspCol,
        dspColName: dspCol || 'Not found',
        hasWeek: !!weekCol,
        weekColName: weekCol || 'Not found',
        hasTenure: !!tenureCol,
        tenureColName: tenureCol || 'Not found'
      }
    };
  };

  // ===== ROW EXPANSION =====
  const toggleRowExpansion = (rowKey) => {
    setExpandedRows(prev => ({
      ...prev,
      [rowKey]: !prev[rowKey]
    }));
  };

  // ===== DRILL-DOWN MODAL =====
  const handleDrillDown = (rawData, rowKey, dsp, compareValue = null) => {
    setDrillDownData({
      data: rawData,
      rowKey: rowKey,
      dsp: dsp,
      compareValue: compareValue
    });
    setShowDrillDown(true);
  };

  const closeDrillDown = () => {
    setShowDrillDown(false);
    setDrillDownData(null);
    // Reset modal position and size when closing
    setModalPosition({ x: 50, y: 50 });
    setModalSize({ width: 90, height: 85 });
  };

  // Modal drag handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('.modal-header')) {
      setIsDragging(true);
      setDragStart({ 
        x: e.clientX - (modalPosition.x * window.innerWidth / 100), 
        y: e.clientY - (modalPosition.y * window.innerHeight / 100) 
      });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      const newX = ((e.clientX - dragStart.x) / window.innerWidth) * 100;
      const newY = ((e.clientY - dragStart.y) / window.innerHeight) * 100;
      setModalPosition({ 
        x: Math.max(0, Math.min(100 - modalSize.width, newX)), 
        y: Math.max(0, Math.min(100 - modalSize.height, newY)) 
      });
    }
    if (isResizing) {
      const newWidth = ((e.clientX - dragStart.x) / window.innerWidth) * 100;
      const newHeight = ((e.clientY - dragStart.y) / window.innerHeight) * 100;
      setModalSize({ 
        width: Math.max(40, Math.min(100, newWidth)), 
        height: Math.max(30, Math.min(100, newHeight)) 
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
  };

  const handleResizeMouseDown = (e) => {
    e.stopPropagation();
    setIsResizing(true);
    setDragStart({ 
      x: e.clientX - (modalSize.width * window.innerWidth / 100), 
      y: e.clientY - (modalSize.height * window.innerHeight / 100) 
    });
  };

  // Maximize modal to full screen
  const maximizeModal = () => {
    setModalPosition({ x: 0, y: 0 });
    setModalSize({ width: 100, height: 100 });
  };

  // Reset modal to default size
  const resetModalSize = () => {
    setModalPosition({ x: 50, y: 50 });
    setModalSize({ width: 90, height: 85 });
  };

  // Handle drill-down for Manager View sub bucket analysis
  const handleSubBucketDrillDown = (subBucket) => {
    // Find the sub bucket column name
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
    
    const subBucketCol = findColumn(['sub bucket', 'sub_bucket', 'subbucket', 'bucket', 'defect type', 'defect_type', 'issue type', 'issue_type', 'reason', 'dnr reason']);
    
    if (!subBucketCol) return;
    
    // Filter data for this sub bucket
    const filteredData = data.filter(row => {
      const rowBucket = row[subBucketCol];
      return rowBucket && rowBucket.toString().trim() === subBucket;
    });
    
    // Reset modal to center position when opening
    setModalPosition({ x: 5, y: 5 });
    setModalSize({ width: 90, height: 85 });
    
    setDrillDownData({
      data: filteredData,
      rowKey: subBucket,
      dsp: 'All DSPs',
      compareValue: null
    });
    setShowDrillDown(true);
  };

  const toggleColumnVisibility = (column) => {
    if (visibleColumns.includes(column)) {
      setVisibleColumns(visibleColumns.filter(c => c !== column));
    } else {
      setVisibleColumns([...visibleColumns, column]);
    }
  };

  // ===== CSV DOWNLOAD =====
  /*
   * downloadCSV: Creates a downloadable CSV file from array of objects
   * 
   * Uses Papa.unparse() to convert JS array to CSV string, then creates
   * a temporary invisible link, triggers a click to download, and cleans up.
   */
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

  /*
   * downloadPivotTable: Exports the current pivot table view to CSV
   * Handles both hierarchical (parent/child rows indented) and flat formats.
   * Child rows are indented with leading spaces in the exported CSV.
   */
  const downloadPivotTable = (pivot) => {
    const exportData = [];
    
    if (pivot.isHierarchical) {
      const sortedParentKeys = Object.keys(pivot.data).sort((a, b) => {
        const aVal = pivot.data[a].values.value_0 || 0;
        const bVal = pivot.data[b].values.value_0 || 0;
        return bVal - aVal;
      });

      sortedParentKeys.forEach(parentKey => {
        // Add parent row
        const parentRow = { [pivotConfig.rowField]: parentKey };
        pivotConfig.valueFields.forEach((vf, vfIndex) => {
          if (vf.field) {
            const value = pivot.data[parentKey].values[`value_${vfIndex}`];
            const formattedValue = vf.aggregation === 'count' || vf.aggregation === 'value' 
              ? value 
              : (typeof value === 'number' ? parseFloat(value.toFixed(4)) : value);
            parentRow[`${getAggregationLabel(vf.aggregation)} of ${vf.field}`] = formattedValue;
          }
        });
        exportData.push(parentRow);

        // Add child rows
        const children = pivot.data[parentKey].children;
        const sortedChildKeys = Object.keys(children).sort((a, b) => {
          const aVal = children[a].values.value_0 || 0;
          const bVal = children[b].values.value_0 || 0;
          return bVal - aVal;
        });

        sortedChildKeys.forEach(childKey => {
          const childRow = { [pivotConfig.rowField]: `  ${childKey}` };
          pivotConfig.valueFields.forEach((vf, vfIndex) => {
            if (vf.field) {
              const value = children[childKey].values[`value_${vfIndex}`];
              const formattedValue = vf.aggregation === 'count' || vf.aggregation === 'value' 
                ? value 
                : (typeof value === 'number' ? parseFloat(value.toFixed(4)) : value);
              childRow[`${getAggregationLabel(vf.aggregation)} of ${vf.field}`] = formattedValue;
            }
          });
          exportData.push(childRow);
        });
      });
    } else {
      const sortedKeys = Object.keys(pivot.data).sort((a, b) => {
        const aVal = pivot.data[a].values?.value_0 || 0;
        const bVal = pivot.data[b].values?.value_0 || 0;
        return bVal - aVal;
      });

      sortedKeys.forEach(rowKey => {
        const row = { [pivotConfig.rowField]: rowKey };
        pivotConfig.valueFields.forEach((vf, vfIndex) => {
          if (vf.field) {
            const value = pivot.data[rowKey].values[`value_${vfIndex}`];
            const formattedValue = vf.aggregation === 'count' || vf.aggregation === 'value' 
              ? value 
              : (typeof value === 'number' ? parseFloat(value.toFixed(4)) : value);
            row[`${getAggregationLabel(vf.aggregation)} of ${vf.field}`] = formattedValue;
          }
        });
        exportData.push(row);
      });
    }
    
    const filename = `${pivot.dsp}_pivot.csv`;
    downloadCSV(exportData, filename);
  };

  const downloadDrillDownData = () => {
    if (!drillDownData) return;
    
    const exportData = drillDownData.data.map(row => {
      const filteredRow = {};
      visibleColumns.forEach(col => {
        filteredRow[col] = row[col] || '';
      });
      return filteredRow;
    });
    
    const filename = `${drillDownData.dsp}_${drillDownData.rowKey}_details.csv`;
    downloadCSV(exportData, filename);
  };

  // ===== FORMAT VALUE FOR DISPLAY =====
  const formatValue = (value, aggregation) => {
    if (aggregation === 'value' || aggregation === 'count') {
      return value;
    }
    if (typeof value === 'number') {
      return value.toFixed(4);
    }
    return value;
  };

  // ===== RENDER HIERARCHICAL TABLE =====
  /*
   * renderHierarchicalTable: Renders Excel-like nested pivot table
   * 
   * Visual structure:
   * ▼ ParentA          | 307.03    <- Bold, clickable to expand/collapse
   *     ChildA1        | 76.75     <- Indented, only visible when parent expanded  
   *     ChildA2        | 230.27
   * ▶ ParentB          | 61.61     <- Collapsed (▶ indicates children hidden)
   * 
   * Cell interactions:
   * - Single click on value cell = toggle orange highlight
   * - Single click on row label = toggle orange highlight
   * - Double click on value cell = open drill-down modal with raw data
   * - Click on parent row (not value cell) = expand/collapse children
   */
  const renderHierarchicalTable = (pivot) => {
    // Sort parent rows by first value field (descending) for better UX
    const sortedParentKeys = Object.keys(pivot.data).sort((a, b) => {
      const aVal = pivot.data[a].values.value_0 || 0;
      const bVal = pivot.data[b].values.value_0 || 0;
      return bVal - aVal;
    });

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gradient-to-r from-slate-800 to-slate-700">
              <th className="text-left p-3 text-cyan-300 font-semibold border border-slate-600">
                {pivotConfig.rowField}
              </th>
              {pivotConfig.valueFields.map((vf, vfIndex) => (
                vf.field && (
                  <th key={vfIndex} className="text-right p-3 text-cyan-300 font-semibold border border-slate-600">
                    {getAggregationLabel(vf.aggregation)} of {vf.field}
                  </th>
                )
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedParentKeys.map((parentKey) => {
              const parentData = pivot.data[parentKey];
              const isExpanded = expandedRows[`${pivot.dsp}-${parentKey}`];
              const children = parentData.children;
              const sortedChildKeys = Object.keys(children).sort((a, b) => {
                const aVal = children[a].values.value_0 || 0;
                const bVal = children[b].values.value_0 || 0;
                return bVal - aVal;
              });
              
              // Row label highlight tracking
              const rowLabelCellId = `${pivot.dsp}-row-${parentKey}`;

              return (
                <React.Fragment key={parentKey}>
                  {/* Parent Row */}
                  <tr 
                    className="bg-slate-900 hover:bg-slate-800 cursor-pointer font-bold"
                    onClick={() => toggleRowExpansion(`${pivot.dsp}-${parentKey}`)}
                  >
                    <td 
                      className={`p-3 border border-slate-700 cursor-pointer ${
                        getRowLabelHighlightClass(rowLabelCellId) || 'text-white'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleManualHighlight(rowLabelCellId, e);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-cyan-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-cyan-400" />
                        )}
                        <span>{parentKey}</span>
                      </div>
                    </td>
                    {pivotConfig.valueFields.map((vf, vfIndex) => {
                      if (!vf.field) return null;
                      const value = parentData.values[`value_${vfIndex}`];
                      const cellId = `${pivot.dsp}-${parentKey}-${vfIndex}`;
                      const highlightClass = getHighlightClass(value, cellId);

                      return (
                        <td 
                          key={vfIndex}
                          className={`p-3 text-right border border-slate-700 cursor-pointer transition-all ${
                            highlightClass || 'text-white'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleManualHighlight(cellId, e);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleDrillDown(parentData.rawData, parentKey, pivot.dsp);
                          }}
                          title="Click to highlight, Double-click for details"
                        >
                          {formatValue(value, vf.aggregation)}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Child Rows */}
                  {isExpanded && sortedChildKeys.map((childKey) => {
                    const childData = children[childKey];
                    const childRowLabelCellId = `${pivot.dsp}-row-${parentKey}-${childKey}`;
                    
                    return (
                      <tr 
                        key={`${parentKey}-${childKey}`}
                        className="bg-slate-950 hover:bg-slate-900"
                      >
                        <td 
                          className={`p-3 border border-slate-700 pl-10 cursor-pointer ${
                            getRowLabelHighlightClass(childRowLabelCellId) || 'text-gray-300'
                          }`}
                          onClick={(e) => toggleManualHighlight(childRowLabelCellId, e)}
                        >
                          {childKey}
                        </td>
                        {pivotConfig.valueFields.map((vf, vfIndex) => {
                          if (!vf.field) return null;
                          const value = childData.values[`value_${vfIndex}`];
                          const cellId = `${pivot.dsp}-${parentKey}-${childKey}-${vfIndex}`;
                          const highlightClass = getHighlightClass(value, cellId);

                          return (
                            <td 
                              key={vfIndex}
                              className={`p-3 text-right border border-slate-700 cursor-pointer transition-all ${
                                highlightClass || 'text-gray-300'
                              }`}
                              onClick={(e) => toggleManualHighlight(cellId, e)}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                handleDrillDown(childData.rawData, childKey, pivot.dsp);
                              }}
                              title="Click to highlight, Double-click for details"
                            >
                              {formatValue(value, vf.aggregation)}
                            </td>
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

  // ===== RENDER STANDARD TABLE =====
  /*
   * renderStandardTable: Renders a flat (non-hierarchical) pivot table
   * Used when subRowField is not set - just a simple grouped table.
   * 
   * Rows are sorted by the first value field (descending) so highest values appear first.
   */
  const renderStandardTable = (pivot) => {
    const sortedKeys = Object.keys(pivot.data).sort((a, b) => {
      const aVal = pivot.data[a].values.value_0 || 0;
      const bVal = pivot.data[b].values.value_0 || 0;
      return bVal - aVal;
    });

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gradient-to-r from-slate-800 to-slate-700">
              <th className="text-left p-3 text-cyan-300 font-semibold border border-slate-600">
                {pivotConfig.rowField}
              </th>
              {pivotConfig.valueFields.map((vf, vfIndex) => (
                vf.field && (
                  <th key={vfIndex} className="text-right p-3 text-cyan-300 font-semibold border border-slate-600">
                    {getAggregationLabel(vf.aggregation)} of {vf.field}
                  </th>
                )
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedKeys.map((rowKey) => {
              const rowData = pivot.data[rowKey];
              const rowLabelCellId = `${pivot.dsp}-row-${rowKey}`;
              
              return (
                <tr 
                  key={rowKey}
                  className="bg-slate-900 hover:bg-slate-800"
                >
                  <td 
                    className={`p-3 border border-slate-700 font-medium cursor-pointer ${
                      getRowLabelHighlightClass(rowLabelCellId) || 'text-white'
                    }`}
                    onClick={(e) => toggleManualHighlight(rowLabelCellId, e)}
                  >
                    {rowKey}
                  </td>
                  {pivotConfig.valueFields.map((vf, vfIndex) => {
                    if (!vf.field) return null;
                    const value = rowData.values[`value_${vfIndex}`];
                    const cellId = `${pivot.dsp}-${rowKey}-${vfIndex}`;
                    const highlightClass = getHighlightClass(value, cellId);

                    return (
                      <td 
                        key={vfIndex}
                        className={`p-3 text-right border border-slate-700 cursor-pointer transition-all ${
                          highlightClass || 'text-white'
                        }`}
                        onClick={(e) => toggleManualHighlight(cellId, e)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDrillDown(rowData.rawData, rowKey, pivot.dsp);
                        }}
                        title="Click to highlight, Double-click for details"
                      >
                        {formatValue(value, vf.aggregation)}
                      </td>
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

  // ===== RENDER COMPARISON TABLE =====
  /*
   * renderComparisonTable: Renders one of the side-by-side comparison tables
   * 
   * @param pivot - The pivot result object containing data for all compare values
   * @param compareVal - The specific comparison value to render (e.g., "Week 1")
   * 
   * This is called multiple times, once for each compareValue selected,
   * to create the side-by-side comparison view.
   */
  const renderComparisonTable = (pivot, compareVal) => {
    const sortedKeys = [...pivot.rowKeys]
      .filter(rowKey => pivot.data[compareVal]?.[rowKey])
      .sort((a, b) => {
        const aVal = pivot.data[compareVal]?.[a]?.values?.value_0 || 0;
        const bVal = pivot.data[compareVal]?.[b]?.values?.value_0 || 0;
        return bVal - aVal;
      });

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gradient-to-r from-slate-800 to-slate-700">
              <th className="text-left p-3 text-cyan-300 font-semibold border border-slate-600">
                {pivotConfig.rowField}
              </th>
              {pivotConfig.valueFields.map((vf, vfIndex) => (
                vf.field && (
                  <th key={vfIndex} className="text-right p-3 text-cyan-300 font-semibold border border-slate-600">
                    {getAggregationLabel(vf.aggregation)} of {vf.field}
                  </th>
                )
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedKeys.map((rowKey) => {
              const rowData = pivot.data[compareVal][rowKey];
              const rowLabelCellId = `${pivot.dsp}-${compareVal}-row-${rowKey}`;
              
              return (
                <tr 
                  key={rowKey}
                  className="bg-slate-900 hover:bg-slate-800"
                >
                  <td 
                    className={`p-3 border border-slate-700 font-medium cursor-pointer ${
                      getRowLabelHighlightClass(rowLabelCellId) || 'text-white'
                    }`}
                    onClick={(e) => toggleManualHighlight(rowLabelCellId, e)}
                  >
                    {rowKey}
                  </td>
                  {pivotConfig.valueFields.map((vf, vfIndex) => {
                    if (!vf.field) return null;
                    const value = rowData?.values?.[`value_${vfIndex}`] ?? 0;
                    const cellId = `${pivot.dsp}-${compareVal}-${rowKey}-${vfIndex}`;
                    const highlightClass = getHighlightClass(value, cellId);

                    return (
                      <td 
                        key={vfIndex}
                        className={`p-3 text-right border border-slate-700 cursor-pointer transition-all ${
                          highlightClass || 'text-white'
                        }`}
                        onClick={(e) => toggleManualHighlight(cellId, e)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDrillDown(rowData.rawData, rowKey, pivot.dsp, compareVal);
                        }}
                        title="Click to highlight, Double-click for details"
                      >
                        {formatValue(value, vf.aggregation)}
                      </td>
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

  // ===== RENDER UI =====
  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-cyan-400 mb-2">
            DSP Analytics Platform
          </h1>
          <p className="text-gray-400">Advanced Hierarchical Pivot Table Analysis</p>
        </div>

        {/* File Upload Section */}
        <div className="bg-slate-900 rounded-xl shadow-lg p-6 mb-6 border border-slate-700">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-600 rounded-xl cursor-pointer hover:bg-slate-800 hover:border-cyan-500 transition-all duration-300">
            <div className="flex flex-col items-center">
              <Upload className="w-10 h-10 text-cyan-400 mb-2" />
              <span className="text-lg font-medium text-gray-300">Click to upload CSV file</span>
            </div>
            <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
          </label>
          {data.length > 0 && (
            <div className="mt-4 p-3 bg-green-900/30 rounded-lg border border-green-700">
              <p className="text-green-400 font-medium">✓ Loaded {data.length} rows with {columns.length} columns</p>
            </div>
          )}
        </div>

        {/* DSP Selection Section */}
        {data.length > 0 && availableValues[columns.find(c => c.toLowerCase().includes('dsp'))] && (
          <div className="bg-slate-900 rounded-xl shadow-lg p-6 mb-6 border border-slate-700">
            <h2 className="text-xl font-bold text-cyan-400 mb-4">Select DSPs</h2>
            <div className="flex flex-wrap gap-2">
              {availableValues[columns.find(c => c.toLowerCase().includes('dsp'))].map(dsp => (
                <button
                  key={dsp}
                  onClick={() => toggleDSP(dsp)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                    selectedDSPs.includes(dsp)
                      ? 'bg-cyan-600 text-white shadow-lg'
                      : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                  }`}
                >
                  {dsp}
                  {selectedDSPs.includes(dsp) && (
                    <X className="inline-block ml-2 w-4 h-4" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pivot Configuration Section */}
        {data.length > 0 && (
          <div className="bg-slate-900 rounded-xl shadow-lg p-6 mb-6 border border-slate-700">
            <h2 className="text-xl font-bold text-cyan-400 mb-6">Pivot Configuration</h2>
            
            {/* Row Field */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-300 mb-2">Row Field (Parent) *</label>
              <select
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                value={pivotConfig.rowField}
                onChange={(e) => setPivotConfig({...pivotConfig, rowField: e.target.value})}
              >
                <option value="">Select field...</option>
                {columns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            {/* Sub-Row Field (NEW) */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-300 mb-2">Sub-Row Field (Child - Optional)</label>
              <select
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                value={pivotConfig.subRowField}
                onChange={(e) => setPivotConfig({...pivotConfig, subRowField: e.target.value})}
              >
                <option value="">None (flat table)</option>
                {columns.filter(col => col !== pivotConfig.rowField).map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Select to create hierarchical grouping like Excel pivot tables</p>
            </div>

            {/* Value Fields */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <label className="block text-sm font-semibold text-gray-300">Value Fields *</label>
                <button
                  onClick={addValueField}
                  className="flex items-center gap-2 px-3 py-1 text-sm bg-cyan-900/50 text-cyan-400 rounded-lg hover:bg-cyan-900 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Add Value
                </button>
              </div>
              
              {pivotConfig.valueFields.map((vf, index) => (
                <div key={index} className="flex gap-3 mb-3 items-center">
                  <select
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                    value={vf.field}
                    onChange={(e) => updateValueField(index, 'field', e.target.value)}
                  >
                    <option value="">Select field...</option>
                    {columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  
                  <select
                    className="w-36 bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                    value={vf.aggregation}
                    onChange={(e) => updateValueField(index, 'aggregation', e.target.value)}
                  >
                    <option value="count">Count</option>
                    <option value="sum">Sum</option>
                    <option value="average">Average</option>
                    <option value="min">Min</option>
                    <option value="max">Max</option>
                    <option value="value">Value (Actual)</option>
                  </select>
                  
                  {pivotConfig.valueFields.length > 1 && (
                    <button
                      onClick={() => removeValueField(index)}
                      className="p-3 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
              <p className="text-xs text-gray-500">Use "Value (Actual)" to see the actual cell content instead of aggregations</p>
            </div>

            {/* Side-by-Side Comparison Section */}
            {!pivotConfig.subRowField && (
              <div className="mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                <h3 className="text-md font-semibold text-purple-400 mb-4">📊 Side-by-Side Comparison (Optional)</h3>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-300 mb-2">Compare Field</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                    value={pivotConfig.compareField}
                    onChange={(e) => setPivotConfig({...pivotConfig, compareField: e.target.value, compareValues: []})}
                  >
                    <option value="">None (standard pivot)</option>
                    {columns.filter(col => !col.toLowerCase().includes('dsp')).map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
                
                {pivotConfig.compareField && availableValues[pivotConfig.compareField] && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">Select values to compare:</label>
                    <div className="flex flex-wrap gap-2">
                      {availableValues[pivotConfig.compareField].map(val => (
                        <button
                          key={val}
                          onClick={() => toggleCompareValue(val)}
                          className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                            pivotConfig.compareValues.includes(val)
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filters Section */}
            <div className="border-t border-slate-700 pt-4 mt-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-md font-semibold text-gray-300">Filters (Optional)</h3>
                <select
                  className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  onChange={(e) => {
                    if (e.target.value) {
                      addFilter(e.target.value);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="">+ Add Filter</option>
                  {columns.filter(col => !pivotConfig.filters[col] && !col.toLowerCase().includes('dsp') && col !== pivotConfig.compareField).map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>

              {Object.keys(pivotConfig.filters).length > 0 && (
                <div className="space-y-2">
                  {Object.keys(pivotConfig.filters).map(filterCol => (
                    <div key={filterCol} className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg">
                      <span className="text-sm font-semibold text-gray-300 w-40">{filterCol}:</span>
                      <select
                        className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                        value={pivotConfig.filters[filterCol]}
                        onChange={(e) => updateFilter(filterCol, e.target.value)}
                      >
                        <option value="">All</option>
                        {availableValues[filterCol] && availableValues[filterCol].map(val => (
                          <option key={val} value={val}>{val}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeFilter(filterCol)}
                        className="p-2 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Auto-Highlight Section */}
            <div className="border-t border-slate-700 pt-4 mt-4">
              <h3 className="text-md font-semibold text-gray-300 mb-4">🎨 Highlighting Options</h3>
              
              {/* Yellow Auto-Highlight (Attention/Issues) */}
              <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <p className="text-sm font-semibold text-yellow-400 mb-2">⚠️ Yellow Auto-Highlight (Attention/Issues)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-400 mb-2">Condition</label>
                    <select
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                      value={highlightConfig.condition}
                      onChange={(e) => setHighlightConfig({...highlightConfig, condition: e.target.value})}
                    >
                      <option value="greater">Greater than</option>
                      <option value="less">Less than</option>
                      <option value="equal">Equal to</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-400 mb-2">Threshold Value</label>
                    <input
                      type="number"
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                      value={highlightConfig.value}
                      onChange={(e) => setHighlightConfig({...highlightConfig, value: e.target.value})}
                      placeholder="Enter value..."
                    />
                  </div>
                </div>
              </div>
              
              {/* Green Auto-Highlight (Improvements) */}
              <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-green-400">✅ Green Auto-Highlight (Improvements)</p>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="mr-2 w-4 h-4"
                      checked={greenHighlightConfig.enabled}
                      onChange={(e) => setGreenHighlightConfig({...greenHighlightConfig, enabled: e.target.checked})}
                    />
                    <span className="text-sm text-gray-400">Enable</span>
                  </label>
                </div>
                {greenHighlightConfig.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-400 mb-2">Condition</label>
                      <select
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                        value={greenHighlightConfig.condition}
                        onChange={(e) => setGreenHighlightConfig({...greenHighlightConfig, condition: e.target.value})}
                      >
                        <option value="greater">Greater than</option>
                        <option value="less">Less than</option>
                        <option value="equal">Equal to</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-400 mb-2">Threshold Value</label>
                      <input
                        type="number"
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                        value={greenHighlightConfig.value}
                        onChange={(e) => setGreenHighlightConfig({...greenHighlightConfig, value: e.target.value})}
                        placeholder="Enter value..."
                      />
                    </div>
                  </div>
                )}
              </div>
              
              {/* Manual Highlight Color Selector */}
              <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <p className="text-sm font-semibold text-gray-300 mb-2">🖱️ Manual Click Highlight Color</p>
                <div className="flex gap-2">
                  <button
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      manualHighlightColor === 'orange' 
                        ? 'bg-amber-500 text-black' 
                        : 'bg-slate-700 text-amber-400 border border-amber-500'
                    }`}
                    onClick={() => setManualHighlightColor('orange')}
                  >
                    Orange (Attention)
                  </button>
                  <button
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      manualHighlightColor === 'green' 
                        ? 'bg-green-500 text-black' 
                        : 'bg-slate-700 text-green-400 border border-green-500'
                    }`}
                    onClick={() => setManualHighlightColor('green')}
                  >
                    Green (Improvement)
                  </button>
                </div>
              </div>
              
              <p className="text-sm text-gray-500 mt-3">
                💡 <span className="text-yellow-400">Yellow</span> = Auto-highlight (issues) | 
                <span className="text-green-400"> Green</span> = Auto/Manual (improvements) | 
                <span className="text-amber-500"> Orange</span> = Manual (attention) | 
                Double-click for drill-down
              </p>
            </div>

            <button
              onClick={createPivotTables}
              className="w-full mt-6 bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-4 px-6 rounded-xl hover:from-cyan-700 hover:to-blue-700 transition-all font-semibold text-lg shadow-lg"
            >
              Generate Pivot Tables
            </button>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6 flex items-start">
            <AlertCircle className="w-6 h-6 text-red-400 mr-3 flex-shrink-0 mt-0.5" />
            <span className="text-red-300 font-medium">{error}</span>
          </div>
        )}

        {/* Manager View Section - Overall Data Analysis */}
        {pivotTables.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowManagerView(!showManagerView)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-xl hover:from-purple-600 hover:to-indigo-600 transition-all font-semibold shadow-lg"
            >
              {showManagerView ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              {showManagerView ? 'Hide Manager View' : 'Show Manager View'}
            </button>
            
            {showManagerView && (
              <div className="mt-4 bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl shadow-2xl p-6 border border-purple-700/50">
                <h2 className="text-2xl font-bold text-purple-400 mb-6 flex items-center gap-2">
                  📊 Manager View - Overall Data Analysis
                </h2>
                
                {(() => {
                  const managerData = generateManagerViewData();
                  if (!managerData) return <p className="text-gray-400">No data available for analysis.</p>;
                  
                  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
                  
                  return (
                    <div className="space-y-6">
                      {/* Data Info - Shows what columns were detected and weeks found */}
                      <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-600 text-sm">
                        <p className="text-gray-400 mb-2">
                          <strong className="text-gray-300">📁 Data Loaded:</strong> {managerData.summary.totalConcessions.toLocaleString()} valid rows 
                          {managerData.summary.rawRowCount !== managerData.summary.totalConcessions && (
                            <span className="text-gray-500"> (from {managerData.summary.rawRowCount} total rows)</span>
                          )}
                        </p>
                        <p className="text-gray-400 mb-1">
                          <strong className="text-gray-300">Columns detected:</strong>{' '}
                          Sub Bucket: <span className={managerData.columns.hasSubBucket ? 'text-green-400' : 'text-red-400'}>{managerData.columns.subBucketColName}</span> | 
                          DSP: <span className={managerData.columns.hasDSP ? 'text-green-400' : 'text-red-400'}>{managerData.columns.dspColName}</span> | 
                          Driver: <span className={managerData.columns.hasDriver ? 'text-green-400' : 'text-red-400'}>{managerData.columns.driverColName}</span> | 
                          Cost: <span className={managerData.columns.hasCost ? 'text-green-400' : 'text-red-400'}>{managerData.columns.costColName}</span> | 
                          Week: <span className={managerData.columns.hasWeek ? 'text-green-400' : 'text-red-400'}>{managerData.columns.weekColName}</span>
                        </p>
                        {managerData.summary.weeksFound && managerData.summary.weeksFound.length > 0 && (
                          <p className="text-gray-400">
                            <strong className="text-gray-300">Weeks in data:</strong>{' '}
                            <span className="text-cyan-400">{managerData.summary.weeksFound.join(', ')}</span>
                          </p>
                        )}
                      </div>
                      
                      {/* Summary Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                          <p className="text-gray-400 text-sm">Total Concessions</p>
                          <p className="text-2xl font-bold text-white">{managerData.summary.totalConcessions.toLocaleString()}</p>
                        </div>
                        {managerData.columns.hasCost && (
                          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                            <p className="text-gray-400 text-sm">Total Cost</p>
                            <p className="text-2xl font-bold text-red-400">{formatCurrency(managerData.summary.totalCost)}</p>
                          </div>
                        )}
                        {managerData.columns.hasCost && (
                          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                            <p className="text-gray-400 text-sm">Avg Cost/Concession</p>
                            <p className="text-2xl font-bold text-orange-400">{formatCurrency(managerData.summary.avgCostPerConcession)}</p>
                          </div>
                        )}
                        {managerData.columns.hasDriver && (
                          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                            <p className="text-gray-400 text-sm">Unique Drivers</p>
                            <p className="text-2xl font-bold text-cyan-400">{managerData.summary.uniqueDrivers}</p>
                          </div>
                        )}
                        {managerData.columns.hasDSP && (
                          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                            <p className="text-gray-400 text-sm">DSPs Affected</p>
                            <p className="text-2xl font-bold text-purple-400">{managerData.summary.uniqueDSPs}</p>
                          </div>
                        )}
                      </div>
                      
                      {/* Sub Bucket Analysis - Problems Ranked */}
                      {managerData.columns.hasSubBucket && managerData.subBucketAnalysis.length > 0 && (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <h3 className="text-lg font-bold text-yellow-400 mb-4">🚨 Problems Ranked by Frequency (High → Low)</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-slate-600">
                                  <th className="text-left p-2 text-gray-400 text-sm">Rank</th>
                                  <th className="text-left p-2 text-gray-400 text-sm">Sub Bucket</th>
                                  <th className="text-right p-2 text-gray-400 text-sm">Count</th>
                                  <th className="text-right p-2 text-gray-400 text-sm">% of Total</th>
                                  {managerData.columns.hasCost && <th className="text-right p-2 text-gray-400 text-sm">Cost Impact</th>}
                                  <th className="text-left p-2 text-gray-400 text-sm">Definition & Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {managerData.subBucketAnalysis.map((item, idx) => (
                                  <tr key={item.bucket} className={`border-b border-slate-700 ${idx < 3 ? 'bg-red-900/20' : ''}`}>
                                    <td className="p-2 text-white font-bold">{idx + 1}</td>
                                    <td className="p-2 text-white font-medium">{item.bucket}</td>
                                    <td 
                                      className="p-2 text-right text-cyan-400 font-bold cursor-pointer hover:text-cyan-300 hover:underline"
                                      onClick={() => handleSubBucketDrillDown(item.bucket)}
                                      title="Click to see TBAs for this sub bucket"
                                    >
                                      {item.count}
                                    </td>
                                    <td className="p-2 text-right text-gray-300">{item.percentage}%</td>
                                    {managerData.columns.hasCost && (
                                      <td className="p-2 text-right text-red-400">{formatCurrency(item.cost)}</td>
                                    )}
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
                          <h3 className="text-lg font-bold text-red-400 mb-4">💰 Problems Ranked by Cost Impact (High → Low)</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-slate-600">
                                  <th className="text-left p-2 text-gray-400 text-sm">Rank</th>
                                  <th className="text-left p-2 text-gray-400 text-sm">Sub Bucket</th>
                                  <th className="text-right p-2 text-gray-400 text-sm">Total Cost</th>
                                  <th className="text-right p-2 text-gray-400 text-sm">Count</th>
                                  <th className="text-right p-2 text-gray-400 text-sm">Avg Cost Each</th>
                                </tr>
                              </thead>
                              <tbody>
                                {managerData.costAnalysis.slice(0, 10).map((item, idx) => (
                                  <tr key={item.bucket} className={`border-b border-slate-700 ${idx < 3 ? 'bg-red-900/20' : ''}`}>
                                    <td className="p-2 text-white font-bold">{idx + 1}</td>
                                    <td className="p-2 text-white font-medium">{item.bucket}</td>
                                    <td className="p-2 text-right text-red-400 font-bold">{formatCurrency(item.cost)}</td>
                                    <td 
                                      className="p-2 text-right text-cyan-400 cursor-pointer hover:text-cyan-300 hover:underline"
                                      onClick={() => handleSubBucketDrillDown(item.bucket)}
                                      title="Click to see TBAs for this sub bucket"
                                    >
                                      {item.count}
                                    </td>
                                    <td className="p-2 text-right text-orange-400">{formatCurrency(item.cost / item.count)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      
                      {/* Driver Analysis - Top Repeat Offenders */}
                      {managerData.columns.hasDriver && managerData.driverAnalysis.length > 0 && (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <h3 className="text-lg font-bold text-orange-400 mb-4">👤 Top Repeat Offender Drivers (Across All DSPs)</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-slate-600">
                                  <th className="text-left p-2 text-gray-400 text-sm">Rank</th>
                                  <th className="text-left p-2 text-gray-400 text-sm">Driver ID</th>
                                  {managerData.columns.hasDSP && <th className="text-left p-2 text-gray-400 text-sm">DSP</th>}
                                  <th className="text-right p-2 text-gray-400 text-sm">Concessions</th>
                                  <th className="text-right p-2 text-gray-400 text-sm">% of Total</th>
                                  {managerData.columns.hasCost && <th className="text-right p-2 text-gray-400 text-sm">Cost Impact</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {managerData.driverAnalysis.slice(0, 15).map((item, idx) => (
                                  <tr key={item.driver} className={`border-b border-slate-700 ${idx < 5 ? 'bg-orange-900/20' : ''}`}>
                                    <td className="p-2 text-white font-bold">{idx + 1}</td>
                                    <td className="p-2 text-cyan-400 font-mono text-sm">{item.driver}</td>
                                    {managerData.columns.hasDSP && <td className="p-2 text-purple-400">{item.dsp}</td>}
                                    <td className="p-2 text-right text-white font-bold">{item.count}</td>
                                    <td className="p-2 text-right text-gray-300">{item.percentage}%</td>
                                    {managerData.columns.hasCost && (
                                      <td className="p-2 text-right text-red-400">{formatCurrency(item.cost)}</td>
                                    )}
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
                              <thead>
                                <tr className="border-b border-slate-600">
                                  <th className="text-left p-2 text-gray-400 text-sm">Rank</th>
                                  <th className="text-left p-2 text-gray-400 text-sm">DSP</th>
                                  <th className="text-right p-2 text-gray-400 text-sm">Concessions</th>
                                  <th className="text-right p-2 text-gray-400 text-sm">% of Total</th>
                                  {managerData.columns.hasCost && <th className="text-right p-2 text-gray-400 text-sm">Cost Impact</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {managerData.dspAnalysis.map((item, idx) => (
                                  <tr key={item.dsp} className={`border-b border-slate-700 ${idx < 3 ? 'bg-purple-900/20' : ''}`}>
                                    <td className="p-2 text-white font-bold">{idx + 1}</td>
                                    <td className="p-2 text-purple-400 font-medium">{item.dsp}</td>
                                    <td className="p-2 text-right text-white font-bold">{item.count}</td>
                                    <td className="p-2 text-right text-gray-300">{item.percentage}%</td>
                                    {managerData.columns.hasCost && (
                                      <td className="p-2 text-right text-red-400">{formatCurrency(item.cost)}</td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      
                      {/* Driver Tenure Breakdown */}
                      {managerData.columns.hasTenure && managerData.tenureAnalysis.length > 0 && (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <h3 className="text-lg font-bold text-teal-400 mb-4">👤 Concessions by Driver Tenure</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-slate-600">
                                  <th className="text-left p-2 text-gray-400 text-sm">Driver Tenure</th>
                                  <th className="text-right p-2 text-gray-400 text-sm">Concessions</th>
                                  <th className="text-right p-2 text-gray-400 text-sm">% of Total</th>
                                  {managerData.columns.hasCost && <th className="text-right p-2 text-gray-400 text-sm">Cost Impact</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {managerData.tenureAnalysis.map((item, idx) => (
                                  <tr key={item.tenure} className={`border-b border-slate-700 ${idx === 0 ? 'bg-teal-900/20' : ''}`}>
                                    <td className="p-2 text-white font-medium">{item.tenure}</td>
                                    <td className="p-2 text-right text-cyan-400 font-bold">{item.count}</td>
                                    <td className="p-2 text-right text-teal-400 font-bold">{item.percentage}%</td>
                                    {managerData.columns.hasCost && (
                                      <td className="p-2 text-right text-red-400">{formatCurrency(item.cost)}</td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      
                      {/* Week Over Week Trends */}
                      {managerData.columns.hasWeek && managerData.weekTrends.length > 1 && (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <h3 className="text-lg font-bold text-green-400 mb-4">📈 Week Over Week Trends</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-slate-600">
                                  <th className="text-left p-2 text-gray-400 text-sm">Week</th>
                                  <th className="text-right p-2 text-gray-400 text-sm">Concessions</th>
                                  {managerData.columns.hasCost && <th className="text-right p-2 text-gray-400 text-sm">Cost</th>}
                                  <th className="text-right p-2 text-gray-400 text-sm">Change</th>
                                </tr>
                              </thead>
                              <tbody>
                                {managerData.weekTrends.map((item, idx) => {
                                  const prevCount = idx > 0 ? managerData.weekTrends[idx - 1].count : item.count;
                                  const change = item.count - prevCount;
                                  const changePercent = prevCount > 0 ? ((change / prevCount) * 100).toFixed(1) : 0;
                                  
                                  return (
                                    <tr key={item.week} className="border-b border-slate-700">
                                      <td className="p-2 text-white font-medium">{item.week}</td>
                                      <td className="p-2 text-right text-cyan-400 font-bold">{item.count}</td>
                                      {managerData.columns.hasCost && (
                                        <td className="p-2 text-right text-red-400">{formatCurrency(item.cost)}</td>
                                      )}
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
                  <h2 className="text-2xl font-bold text-cyan-400">
                    DSP: {pivot.dsp}
                  </h2>
                  <button
                    onClick={() => downloadPivotTable(pivot)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-900/50 text-green-400 rounded-lg hover:bg-green-900 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </button>
                </div>

                {/* Summary Statement - Manager-style overview comparing periods */}
                {generateSummaryStatement(pivot) && (
                  <div className="mb-4 p-4 bg-slate-800 border border-slate-600 rounded-lg">
                    <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">
                      {generateSummaryStatement(pivot)}
                    </p>
                  </div>
                )}

                {pivot.isHierarchical ? (
                  renderHierarchicalTable(pivot)
                ) : pivot.isComparison ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pivotConfig.compareValues.map((compareVal) => (
                      <div key={compareVal}>
                        <div className="mb-2 p-2 bg-purple-900/30 rounded-lg text-center">
                          <h3 className="font-bold text-purple-400 text-sm">
                            {pivotConfig.compareField}: {compareVal}
                          </h3>
                        </div>
                        {renderComparisonTable(pivot, compareVal)}
                      </div>
                    ))}
                  </div>
                ) : (
                  renderStandardTable(pivot)
                )}
              </div>
            ))}
          </div>
        )}

        {/* Drill-Down Modal - Draggable and Resizable */}
        {showDrillDown && drillDownData && (
          <div 
            className="fixed inset-0 bg-black/60 z-50"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div 
              className="absolute bg-slate-900 rounded-xl shadow-2xl overflow-hidden border border-slate-700 flex flex-col"
              style={{
                left: `${modalPosition.x}%`,
                top: `${modalPosition.y}%`,
                width: `${modalSize.width}%`,
                height: `${modalSize.height}%`,
                transform: 'translate(0, 0)'
              }}
            >
              {/* Draggable Header */}
              <div 
                className="modal-header p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center cursor-move select-none"
                onMouseDown={handleMouseDown}
              >
                <div>
                  <h3 className="text-xl font-bold text-cyan-400">
                    Details: {drillDownData.rowKey}
                  </h3>
                  <p className="text-sm text-gray-400">
                    DSP: {drillDownData.dsp} | {drillDownData.data.length} records
                    <span className="ml-2 text-gray-500">(Drag header to move, drag corner to resize)</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowColumnSelector(!showColumnSelector)}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-700 text-gray-300 rounded-lg hover:bg-slate-600 transition-all"
                  >
                    <Settings className="w-4 h-4" />
                    Columns
                  </button>
                  <button
                    onClick={downloadDrillDownData}
                    className="flex items-center gap-2 px-3 py-2 bg-green-900/50 text-green-400 rounded-lg hover:bg-green-900 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </button>
                  <button
                    onClick={maximizeModal}
                    className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
                    title="Maximize"
                  >
                    <ChevronRight className="w-5 h-5 rotate-45" />
                  </button>
                  <button
                    onClick={resetModalSize}
                    className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
                    title="Reset Size"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                  <button
                    onClick={closeDrillDown}
                    className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {showColumnSelector && (
                <div className="p-4 bg-slate-800/50 border-b border-slate-700">
                  <p className="text-sm text-gray-400 mb-2">Toggle columns:</p>
                  <div className="flex flex-wrap gap-2">
                    {columns.map(col => (
                      <button
                        key={col}
                        onClick={() => toggleColumnVisibility(col)}
                        className={`px-3 py-1 text-xs rounded-lg transition-all ${
                          visibleColumns.includes(col)
                            ? 'bg-cyan-600 text-white'
                            : 'bg-slate-700 text-gray-400'
                        }`}
                      >
                        {visibleColumns.includes(col) ? <Eye className="w-3 h-3 inline mr-1" /> : <EyeOff className="w-3 h-3 inline mr-1" />}
                        {col}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Scrollable content area */}
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0">
                    <tr className="bg-slate-800">
                      {visibleColumns.map(col => (
                        <th key={col} className="text-left p-3 text-cyan-300 font-semibold border border-slate-700 text-sm whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drillDownData.data.map((row, rowIndex) => (
                      <tr key={rowIndex} className="bg-slate-900 hover:bg-slate-800">
                        {visibleColumns.map(col => (
                          <td key={col} className="p-3 text-gray-300 border border-slate-700 text-sm">
                            {row[col] || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Resize handle - bottom right corner */}
              <div
                className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize bg-slate-700 hover:bg-slate-600 rounded-tl-lg flex items-center justify-center"
                onMouseDown={handleResizeMouseDown}
              >
                <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
