import React, { Component } from 'react';
import { connect } from 'react-redux';
import dynamic from 'next/dynamic';
import qs from 'qs';
import { Button } from 'antd';
import { certifiable_offline_components } from '../../../config/config';

import {
  moveDataset,
  moveDatasetFromCycleView,
  reGenerateCache,
} from '../../../ducks/offline/datasets';
import { visualizeDataset } from '../../../ducks/json/ui';
import { showManageDatasetModal } from '../../../ducks/offline/ui';
import { showLumisectionModal } from '../../../ducks/global_ui';
import { showConfigurationModal as showOfflineConfigurationModal } from '../../../ducks/offline/ui';
import format_filters from '../../common/CommonTableComponents/FilteringAndSorting/format_filters';
import format_sortings from '../../common/CommonTableComponents/FilteringAndSorting/format_sortings';
import rename_triplets from '../../common/CommonTableComponents/FilteringAndSorting/rename_triplets';

import ReactTable from 'react-table';
import column_generator from './columns/columns';

const Filter = dynamic(
  import('../../common/CommonTableComponents/filter/Filter'),
  {
    ssr: false,
  }
);

const valueProcessor = ({ field, operator, value }) => {
  if (field && field.startsWith('triplet_summary')) {
    return {
      // We add default value, because when selected triplet_summary value is GOOD in display, but not in select
      field: `${field}.${value || 'GOOD'}`,
      operator: '>',
      value: 0,
    };
  }
  if ((field && field.includes('_state')) || field === 'state') {
    // We add default value, because when selected triplet_summary value is OPEN in display, but not in select
    return {
      field,
      operator,
      value: value || 'OPEN',
    };
  }
  if (value === '') {
    // If user enters new value, we default to something that is true before the user types, in this case that run_number is not null (which will always be true):
    return { field: 'run_number', operator: '<>', value: null };
  }
  if (field === 'run_number' && operator === 'in') {
    // Handle the case where there are lots of run numbers in the text field:
    value = value.replace(/,/g, ''); // Replace commas for spaces, useful for input of runs in syntax: 325334, 234563
    value = value.trim().replace(/ +/g, ' '); // Replace more than one space for 1 space
    const run_numbers = value.split(' ').filter((arg) => arg !== ''); // Split per space
    return {
      combinator: 'or',
      not: false,
      rules: run_numbers.map((run_number) => {
        return {
          field: 'run_number',
          operator: '=',
          value: run_number,
        };
      }),
    };
  }

  if (field === 'run_number' && operator === 'not in') {
    // Handle the case where there are lots of run numbers in the text field:
    value = value.replace(/,/g, ''); // Replace commas for spaces, useful for input of runs in syntax: 325334, 234563
    value = value.trim().replace(/ +/g, ' '); // Replace more than one space for 1 space
    const run_numbers = value.split(' ').filter((arg) => arg !== ''); // Split per space
    return {
      combinator: 'and',
      not: false,
      rules: run_numbers.map((run_number) => {
        return {
          field: 'run_number',
          operator: '<>',
          value: run_number,
        };
      }),
    };
  }

  if (field === 'oms_attributes.ls_duration') {
    value = parseInt(value);
  }
  return { field, operator, value };
};

const offline_columns = [];

const generate_state_columns = () => {
  const columns = [];
  for (const [key, val] of Object.entries(certifiable_offline_components)) {
    columns.push({
      Header: `${key} state`,
      accessor: `${key}_state`,
      minWidth: 90,
      maxWidth: 90,
      Cell: ({ original, value }) => (
        <div style={{ textAlign: 'center' }}>
          <span
            style={{
              color: 'white',
              fontSize: '0.95em',
              fontWeight: 'bold',
              color: value === 'OPEN' ? 'red' : 'grey',
              borderRadius: '1px',
            }}
          >
            <span style={{ padding: '4px' }}>{value}</span>
          </span>
        </div>
      ),
    });
  }
  return columns;
};

class DatasetTable extends Component {
  constructor(props) {
    super(props);
    this.defaultPageSize = props.defaultPageSize;

    // Not starts loading in cycles:
    this.state = {
      filters: {},
      sortings: [],
      loading: true,
      error: '',
    };
  }

  filterTable = async (filters, page, pageSize) => {
    this.setState({ filters, loading: true, error: '' });
    try {
      const { sortings } = this.state;
      const renamed_sortings = rename_triplets(sortings, false);
      const formated_sortings = format_sortings(renamed_sortings);
      await this.props.filterDatasets(
        pageSize || this.defaultPageSize,
        page,
        formated_sortings,
        filters
      );
    } catch (err) {
      console.log(err);
      this.setState({ loading: false, error: err });
    }
    this.setState({ loading: false });
  };

  sortTable = async (sortings, page, pageSize) => {
    this.setState({ sortings, loading: true, error: '' });
    try {
      const { filters } = this.state;
      const renamed_sortings = rename_triplets(sortings, false);
      const formated_sortings = format_sortings(renamed_sortings);
      await this.props.filterDatasets(
        pageSize || this.defaultPageSize,
        page,
        formated_sortings,
        filters
      );
    } catch (e) {
      console.log(e);
      this.setState({ loading: false, error: err });
    }
    this.setState({ loading: false });
  };
  onPageChange = async (page) => {
    this.sortTable(this.state.sortings, page);
  };
  onPageSizeChange = async (newSize, page) => {
    this.defaultPageSize = newSize;
    this.sortTable(this.state.sortings, page, newSize);
  };

  render() {
    const {
      filters,
      sortings,
      loading,
      show_state_columns,
      filterable,
      error,
    } = this.state;
    const {
      dataset_table,
      moveDataset,
      moveDatasetFromCycleView,
      filter_prefix_from_url,
      showManageDatasetModal,
      showLumisectionModal,
      workspaces,
      reGenerateCache,
      show_workspace_state_columns_button,
      table_label,
      visualizeDataset,
    } = this.props;
    // In debugging view we only use global workspace
    const workspace = 'global';
    let { datasets, pages, count } = dataset_table;
    let columns = column_generator({
      showManageDatasetModal,
      showLumisectionModal,
      workspace,
      workspaces,
      reGenerateCache,
      visualizeDataset,
    });

    // Filter is on if there is an 'and' and it has contents
    const filter =
      (filters.and && filters.and.length > 0) || sortings.length > 0;
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            {filter ? 'Datasets with filter ' : table_label} (
            {loading ? 'loading...' : count}):{' '}
            {filter && (
              <a onClick={this.removeFilters}>
                &nbsp; Click here to remove all filters and sortings
              </a>
            )}
          </div>
        </div>

        <Filter
          table_columns={columns
            .filter(({ accessor }) => !!accessor)
            .map(({ prefix_for_filtering: prefix, id }) => ({
              name: `${prefix}${prefix && '.'}${id}`,
              label: id,
            }))}
          key={workspace}
          ignore_filters_from_url={true}
          other_columns={offline_columns}
          filterTable={this.filterTable}
          valueProcessor={valueProcessor}
          filter_prefix_from_url={filter_prefix_from_url}
          setParentLoading={(loading) => this.setState({ loading })}
        />
        {error && (
          <div style={{ color: 'red' }}>
            <strong>{error}</strong>
          </div>
        )}
        <ReactTable
          columns={columns}
          sorted={sortings}
          manual
          pageSizeOptions={[5, 10, 12, 20, 25, 50, 75, 100]}
          data={
            datasets // Forces table not to paginate or sort automatically, so we can handle it server-side
          }
          pages={pages}
          loading={loading}
          onPageChange={(page) => {
            this.onPageChange(page);
          }}
          onPageSizeChange={(pageSize, page) =>
            this.onPageSizeChange(pageSize, page)
          }
          onSortedChange={(sortings) => {
            // 0 is for first page
            this.sortTable(sortings, 0);
          }}
          filterable={filterable}
          defaultPageSize={
            this.defaultPageSize // Request new data when things change
          }
          className="-striped -highlight"
        />
        <br />
        {show_workspace_state_columns_button && (
          <Button
            onClick={() =>
              this.setState({
                show_state_columns: !show_state_columns,
              })
            }
          >
            {show_state_columns
              ? 'Hide workspace state columns'
              : 'Show workspace state columns'}
          </Button>
        )}
        <style jsx global>{`
          .ReactTable .rt-th,
          .ReactTable .rt-td {
            font-size: 11px;
            padding: 3px 3px !important;
          }
        `}</style>
      </div>
    );
  }
}

const mapStateToProps = (state) => {
  return {
    workspaces: state.offline.workspace.workspaces,
    workspace: 'global',
  };
};

export default connect(
  mapStateToProps,
  {
    showManageDatasetModal,
    showLumisectionModal,
    moveDataset,
    moveDatasetFromCycleView,
    reGenerateCache,
    showOfflineConfigurationModal,
    visualizeDataset,
  },
  null,
  { forwardRef: true }
)(DatasetTable);
