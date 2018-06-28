/* globals CustomEvent */

'use strict';

/**
 * This module supports the {@link dataModelAPI}.
 *
 * Contents:
 * * `getCell` default
 * * `getCellEditorAt` default
 * * A mixin for the {@link Behavior} object containing:
 *    * {@link Behavior#getNewDataModel getNewDataModel(options)} method
 *    * {@link Behavior#resetDataModel resetDataModel()} method
 *    * {@link Behavior#dataModelSupports dataModelSupports(methodName)} method
 *    * {@link Behavior#schema schema} accessor
 *    * {@link Behavior#charMap charMap} read-only accessor
 *    * Various forwarding methods for common data model API calls
 *
 * {@link Behavior#resetDataModel resetDataModel(options)}` installs data model events, fallbacks, and hooks.
 *
 * @module dataModel
 */


/** @name DataSource
 * @memberOf Behavior#
 * @default require('datasaur-local')
 * @summary Default data source.
 * @desc If defined, will be used as a default data source for newly instantiated `Hypergrid` objects without `DataSource` or `dataSource` options specified. Scheduled for removal in next version (v4).
 * @deprecated
 */
var DefaultDataModel = require('datasaur-local');


var fallbacks = require('./fallbacks');
var HypergridError = require('../../lib/error');


var warned = {};


/**
 * Behavior.js mixes this module into its prototype.
 * @mixin
 */
var mixin = {
    /**
     * Create a new data model
     * @param {object} [options]
     * @param {dataModelAPI} [options.dataModel] - A fully instantiated data model object.
     * @param {function} [options.DataModel=require('datasaur-local')] - Data model will be instantiated from this constructor unless `options.dataModel` was given.
     * @returns {boolean} `true` if the data model has changed.
     * @memberOf Behavior#
     */
    getNewDataModel: function(options) {
        var newDataModel;

        options = options || {};

        if (options.dataModel) {
            newDataModel = options.dataModel;
        } else if (options.DataModel) {
            newDataModel = new options.DataModel;
        } else {
            newDataModel = new DefaultDataModel;
        }

        return newDataModel;
    },

    /**
     * Attach a data model object to the grid.
     *
     * Called from {@link Behavior#reset}.
     * @this {Behavior}
     * @param {object} [options]
     * @param {dataModelAPI} [options.dataModel] - A fully instantiated data model object.
     * @param {function} [options.DataModel=require('datasaur-local')] - Data model will be instantiated from this constructor unless `options.dataModel` was given.
     * @param {dataModelAPI} [options.metadata] - Passed to {@link dataModelAPI#setMetadataStore setMetadataStore}.
     * @returns {boolean} `true` if the data model has changed.
     * @memberOf Behavior#
     */
    resetDataModel: function(options) {
        var newDataModel = this.getNewDataModel(options),
            changed = newDataModel && newDataModel !== this.dataModel;

        if (changed) {
            this.dataModel = this.decorateDataModel(newDataModel, options);
            addDeprecationWarnings.call(this);
            addFriendlierDrillDownMapKeys.call(this);
        }

        return changed;
    },

    /**
     * @param {dataModelAPI} newDataModel
     * @param {dataModelAPI} [options.metadata] - Passed to {@link dataModelAPI#setMetadataStore setMetadataStore}.
     */
    decorateDataModel: function(newDataModel, options) {
        addPolyfills(newDataModel);
        addFallbacks(newDataModel, this.grid);
        addHooks(newDataModel);

        newDataModel.setMetadataStore(options && options.metadata);

        return newDataModel;
    },

    /**
     * @summary Convenience getter/setter.
     * @desc Calls the data model's `getSchema`/`setSchema` methods.
     * @see {@link https://fin-hypergrid.github.io/doc/dataModelAPI.html#getSchema|getSchema}
     * @see {@link https://fin-hypergrid.github.io/doc/dataModelAPI.html#setSchema|setSchema}
     * @type {Array}
     * @memberOf Behavior#
     */
    get schema() {
        return this.dataModel.getSchema();
    },
    set schema(newSchema) {
        this.dataModel.setSchema(newSchema);
    },

    /**
     * @summary Map of drill down characters used by the data model.
     * @see {@link https://fin-hypergrid.github.io/doc/dataModelAPI.html#charMap|charMap}
     * @type {{OPEN:string, CLOSE:string, INDENT:string}}
     * @memberOf Behavior#
     */
    get charMap() {
        return this.dataModel.drillDownCharMap;
    },

    /**
     * @summary Calls `isDrillDown()` on the data model.
     * @see {@link https://fin-hypergrid.github.io/doc/dataModelAPI.html#isDrillDown|isDrillDown}
     * @memberOf Behavior#
     */
    isDrillDown: function(x) {
        return this.dataModel.isDrillDown(x);
    },

    /**
     * @summary Calls `click()` on the data model.
     * @see {@link https://fin-hypergrid.github.io/doc/dataModelAPI.html#click|click}
     * @memberOf Behavior#
     */
    click: function(y) {
        return this.dataModel.click(y);
    },

    /**
     * @summary Calls `apply()` on the data model.
     * @see {@link https://fin-hypergrid.github.io/doc/dataModelAPI.html#reindex|reindex}
     * @memberOf Behavior#
     */
    reindex: function() {
        this.dataModel.apply();
    },

    /**
     * @summary Gets the number of rows in the data subgrid.
     * @see {@link https://fin-hypergrid.github.io/doc/dataModelAPI.html#getRowCount|getRowCount}
     * @memberOf Behavior#
     */
    getRowCount: function() {
        return this.dataModel.getRowCount();
    },

    /**
     * Retrieve a data row from the data model.
     * @see {@link https://fin-hypergrid.github.io/doc/dataModelAPI.html#getRow|getRow}
     * @memberOf Behavior#
     * @return {dataRowObject} The data row object at y index.
     * @param {number} y - the row index of interest
     */
    getRow: function(y) {
        return this.dataModel.getRow(y);
    },

    /**
     * Retrieve all data rows from the data model.
     * > Use with caution!
     * @see {@link https://fin-hypergrid.github.io/doc/dataModelAPI.html#getData|getData}
     * @return {dataRowObject[]}
     * @memberOf Behavior#
     */
    getData: function() {
        return this.dataModel.getData();
    },

    /**
     * @memberOf Behavior#
     */
    getIndexedData: function() {
        return this.deprecated('getIndexedData()', 'getData()', '3.0.0');
    },

    /**
     * @summary Calls `click` on the data model if column is a tree column.
     * @desc Sends clicked cell's coordinates to the data model.
     * @see {@link https://fin-hypergrid.github.io/doc/dataModelAPI.html#isDrillDown|isDrillDown}
     * @see {@link https://fin-hypergrid.github.io/doc/dataModelAPI.html#click|click}
     * @param {CellEvent} event
     * @returns {boolean} If click was in a drill down column and click on this row was "consumed" by the data model (_i.e., caused it's state to change).
     * @memberOf Behavior#
     */
    cellClicked: function(event) {
        return this.isDrillDown(event.dataCell.x) && this.click(event.dataCell.y);
    }
};

/**
 * @implements {dataModelAPI#getCell}
 * @memberOf module:dataModel
 */
function getCell(config, rendererName) {
    return config.grid.cellRenderers.get(rendererName);
}

/**
 * @implements {dataModelAPI#getCellEditorAt}
 * @memberOf module:dataModel
 */
function getCellEditorAt(columnIndex, rowIndex, editorName, cellEvent) {
    return cellEvent.grid.cellEditors.create(editorName, cellEvent);
}


//////// LOCAL METHODS -- to be called with `.call(this`

/**
 * @param {dataModelAPI} dataModel
 */
function addPolyfills(dataModel) {
    if (!dataModel.bubble) {
        dataModel.bubble = function(api, fallback) {
            if (fallback && !Array.isArray(api)) {
                api = api || this;
                Object.keys(api).filter(function(key) {
                    return typeof api[key] === 'function';
                }).forEach(function(key) {
                    if (!this[key]) {
                        this[key] = api[key];
                    }
                }, this);
            }
        };
    }
}

/**
 * Inject fallback methods into data model when not implemented by data model.
 * Also adds `dispatchEvent`, called by data model to communicate back to Hypergrid.
 * (Hypergrid itself never calls `dispatchEvent` on the data model.)
 * @param {dataModelAPI} dataModel
 * @param {Hypergrid} grid
 * @private
 */
function addFallbacks(dataModel, grid) {
    dataModel.bubble(fallbacks, true);
    dataModel.bubble({ dispatchEvent: dispatchEvent.bind(grid) }, true);
}

var REGEX_DATA_EVENT_STRING = /^data-((schema-|shape-)?changed|(pre|post)reindex)$/;

/**
 * @private
 * @this {Hypergrid}
 * @param eventName
 * @param eventDetail
 */
function dispatchEvent(eventName, eventDetail) {
    if (!REGEX_DATA_EVENT_STRING.test(eventName)) {
        throw new HypergridError('Expected event string to match ' + REGEX_DATA_EVENT_STRING + '.');
    }
    this.canvas.dispatchEvent(new CustomEvent('fin-canvas-' + eventName, eventDetail));
}

/**
 * @private
 * @this {Behavior}
 */
function addDeprecationWarnings() {
    var grid = this.grid;

    Object.defineProperty(this.dataModel, 'grid', {
        configurable: true,
        enumerable: false,
        get: function() {
            if (!warned.grid) {
                console.warn('`this.grid` (dataModel.grid) property has been deprecated as of v3.0.0 and will be removed in a future version. Data models should have no direct knowledge of or access to the grid. (If you need access to the grid object within your `getCell` or `getCellEditAt` override functions, define it in a closure.)');
                warned.grid = true;
            }
            return grid;
        }
    });

    if (this.dataModel.dataSource) {
        if (!warned.dataSource) {
            console.warn('As of Hypergrid 3.0.0, the external data model is now `grid.behavior.dataModel`. Formerly, it was `grid.behavior.dataModel.dataSource`. Data model authors are strongly advised to avoid implementing a `.dataSource` property inside their data model to reduce the confusion that would result if a legacy application were to try to reference the data model via `.dataModel.dataSource` and get something unexpected instead of an error.)');
        }
    }
}

// for app layer access to drill down chars, provide friendlier keys than data model normally supports in `drillDownCharMap`.
var friendlierDrillDownMapKeys = {
    true: 'OPEN',
    false: 'CLOSE',
    null: 'INDENT'
};

/**
 * @private
 * @this {Behavior}
 */
function addFriendlierDrillDownMapKeys() {
    var charMap = this.dataModel.drillDownCharMap;
    if (charMap) {
        Object.keys(friendlierDrillDownMapKeys).forEach(function(key) {
            if (key in charMap) {
                var friendlierKey = friendlierDrillDownMapKeys[key];
                if (!(friendlierKey in charMap)) {
                    Object.defineProperty(charMap, friendlierKey, {
                        get: function() { return this[key]; },
                        set: function(s) { this[key] = s; }
                    });
                }
            }
        });
    }
}

/**
 * @param {dataModelAPI} dataModel
 */
function addHooks(dataModel) {
    if (!dataModel.getCell) {
        dataModel.getCell = getCell;
    }

    if (!dataModel.getCellEditorAt) {
        dataModel.getCellEditorAt = getCellEditorAt;
    }
}


module.exports = {
    getCell: getCell,
    getCellEditorAt: getCellEditorAt,
    mixin: mixin
};
