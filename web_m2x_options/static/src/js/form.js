/* Copyright 2016 0k.io,ACSONE SA/NV
 *  * License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl). */

odoo.define('web_m2x_options.web_m2x_options', function (require) {
    "use strict";

    var $ = require("$");
    var core = require('web.core'),
        data = require('web.data'),
        Dialog = require('web.Dialog'),
        Model = require('web.Model'),
        form_relational = require('web.form_relational'),
        session = require('web.session'),
        _t  = core._t;

    var OPTIONS = ['web_m2x_options.create',
                   'web_m2x_options.create_edit',
                   'web_m2x_options.limit',
                   'web_m2x_options.search_more',
                   'web_m2x_options.m2o_dialog',
                   'web_m2x_options.search_mru',];

    var M2ODialog = Dialog.extend({
        template: "M2ODialog",
        init: function(parent) {
            this.name = parent.string;
            this._super(parent, {
                title: _.str.sprintf(_t("Create a %s"), parent.string),
                size: 'medium',
                buttons: [
                    {text: _t('Create'), classes: 'btn-primary', click: function() {
                        if (this.$("input").val() !== ''){
                            this.getParent()._quick_create(this.$("input").val());
                            this.close();
                        } else {
                            e.preventDefault();
                            this.$("input").focus();
                        }
                    }},

                    {text: _t('Create and edit'), classes: 'btn-primary', close: true, click: function() {
                        this.getParent()._search_create_popup("form", undefined, this.getParent()._create_context(this.$("input").val()));
                    }},

                    {text: _t('Cancel'), close: true}
                ]
            });
        },
        start: function() {
            var text = _.str.sprintf(_t("You are creating a new %s, are you sure it does not exist yet?"), this.name);
            this.$("p").text(text);
            this.$("input").val(this.getParent().$input.val());
        },
    });

    form_relational.FieldMany2One.include({

        start: function() {
            this._super.apply(this, arguments);
            return this.get_options();
        },

        get_options: function() {
            var self = this;
            if (!_.isUndefined(this.view) && _.isUndefined(this.view.ir_options_loaded)) {
            this.view.ir_options_loaded = $.Deferred();
            this.view.ir_options = {};
            (new Model("ir.config_parameter"))
                .query(["key", "value"]).filter([['key', 'in', OPTIONS]])
                .all().then(function(records) {
                _(records).each(function(record) {
                    self.view.ir_options[record.key] = record.value;
                });
                self.view.ir_options_loaded.resolve();
                });
                return this.view.ir_options_loaded;
            }
            return $.when();
        },

        is_option_set: function(option) {
            if (_.isUndefined(option)) {
                return false
            }
            var is_string = typeof option === 'string'
            var is_bool = typeof option === 'boolean'
            if (is_string) {
                return option === 'true' || option === 'True'
            } else if (is_bool) {
                return option
            }
            return false
        },

        show_error_displayer: function () {
            if(this.is_option_set(this.options.m2o_dialog) ||
               _.isUndefined(this.options.m2o_dialog) && this.is_option_set(this.view.ir_options['web_m2x_options.m2o_dialog']) ||
               this.can_create && _.isUndefined(this.options.m2o_dialog) && _.isUndefined(this.view.ir_options['web_m2x_options.m2o_dialog'])) {
                new M2ODialog(this).open();
            }
        },

        compute_mru_key: function(){
            var self = this,
                model = self.view.model,
                db = self.session.db,
                view_id = null;
            if (self.view.view_id){
                view_id = "v_" + self.view.view_id
            }else{
                if(self.view.options.action != null){
                    view_id = "a_" + self.view.options.action.id;
                }else{
                    view_id = "a_" + self.view.dataset.parent_view.options.action.id
                }
            }
            return db + "/" + model + "/" + view_id + "/" + self.name;
        },

        get_search_mru: function(){
            var mru_option = 'web_m2x_options_mru';
                self = this;
            var restore_mru_list = JSON.parse(localStorage.getItem(mru_option)),
                key = self.compute_mru_key();
            if (restore_mru_list) {
                if (!_.isUndefined(restore_mru_list[key])){
                    return ['id', 'in', restore_mru_list[key]];
                }
            }
            return [];
        },
        get_search_result: function (search_val) {
            var Objects = new Model(this.field.relation);
            var def = $.Deferred();
            var self = this;
            // add options limit used to change number of selections record
            // returned.
            if (_.isUndefined(this.view))
                    return this._super.apply(this, arguments);
                if (!_.isUndefined(this.view.ir_options['web_m2x_options.limit'])) {
                this.limit = parseInt(this.view.ir_options['web_m2x_options.limit']);
            }

            if (typeof this.options.limit === 'number') {
                this.limit = this.options.limit;
            }

            // add options field_color and colors to color item(s) depending on field_color value
            this.field_color = this.options.field_color
            this.colors = this.options.colors

            var dataset = new data.DataSet(this, this.field.relation,
                                                   self.build_context());
            var domain_list = [];
            var blacklist = this.get_search_blacklist();
            if(!_(blacklist).isEmpty()){
                domain_list.push(blacklist);
            }
            var can_search_mru = (self.options && self.is_option_set(self.options.search_mru)),
                search_mru_undef = _.isUndefined(self.options.search_mru),
                search_mru = self.is_option_set(self.view.ir_options['web_m2x_options.search_mru']);

            var mru_list = self.get_search_mru();
            if(search_val == "" && (can_search_mru || (search_mru_undef && search_mru))){
                if (!_(mru_list).isEmpty()){
                    domain_list.push(mru_list);
                }
            }
            this.last_query = search_val;

            var search_result = this.orderer.add(dataset.name_search(
                search_val,
                new data.CompoundDomain(
                    self.build_domain(), domain_list),
                'ilike', this.limit + 1,
                self.build_context()));

            var create_rights;
            if (!(self.options && (self.is_option_set(self.options.create) || self.is_option_set(self.options.create_edit)))) {
                create_rights = new Model(this.field.relation).call(
                    "check_access_rights", ["create", false]);
            }

            $.when(search_result, create_rights).then(function (data, can_create) {

                self.can_create = can_create;  // for ``.show_error_displayer()``
                self.last_search = data;
                // possible selections for the m2o
                var values = _.map(data, function (x) {
                    x[1] = x[1].split("\n")[0];
                    return {
                        label: _.str.escapeHTML(x[1]),
                        value: x[1],
                        name: x[1],
                        id: x[0],
                    };
                });

                // Search result value colors
                if (self.colors && self.field_color) {
                    var value_ids = [];
                    for (var index in values) {
                        value_ids.push(values[index].id);
                    }
                    // RPC request to get field_color from Objects
                    Objects.query([self.field_color])
                                .filter([['id', 'in', value_ids]])
                                .all().done(function (objects) {
                                    for (var index in objects) {
                                        for (var index_value in values) {
                                            if (values[index_value].id == objects[index].id) {
                                                // Find value in values by comparing ids
                                                var value = values[index_value];
                                                // Find color with field value as key
                                                var color = self.colors[objects[index][self.field_color]] || 'black';
                                                value.label = '<span style="color:'+color+'">'+value.label+'</span>';
                                                break;
                                            }
                                        }
                                    }
                                    def.resolve(values);
                                });
                }
                // add label favorites if favorites option is set and
                // search_val is empty
                if(search_val == "" && (can_search_mru || (search_mru_undef && search_mru))){
                    if (!_(mru_list).isEmpty() && !_(values).isEmpty()){
                        values.unshift({
                            label: _t("Most Recently Used:"),
                            classname: 'oe_m2o_dropdown_option',
                        });
                    }
                }

                // search more... if more results that max
                var can_search_more = (self.options && self.is_option_set(self.options.search_more)),
                    search_more_undef = _.isUndefined(self.options.search_more) && _.isUndefined(self.view.ir_options['web_m2x_options.search_more']),
                    search_more = self.is_option_set(self.view.ir_options['web_m2x_options.search_more']);

                if (values.length > self.limit && (can_search_more || search_more_undef || search_more)) {
                    values = values.slice(0, self.limit);
                    values.push({
                        label: _t("Search More..."),
                        action: function () {
                            // limit = 80 for improving performance, similar
                            // to Odoo implementation here:
                            // https://github.com/odoo/odoo/commit/8c3cdce539d87775b59b3f2d5ceb433f995821bf
                            dataset.name_search(
                                search_val, self.build_domain(),
                                'ilike', 80).done(function (data) {
                                    self._search_create_popup("search", data);
                                });
                        },
                        classname: 'oe_m2o_dropdown_option'
                    });
                }

                // quick create

                var raw_result = _(data.result).map(function (x) {
                    return x[1];
                });
                var quick_create = self.is_option_set(self.options.create) || self.is_option_set(self.options.quick_create),
                    quick_create_undef = _.isUndefined(self.options.create) && _.isUndefined(self.options.quick_create),
                    m2x_create_undef = _.isUndefined(self.view.ir_options['web_m2x_options.create']),
                    m2x_create = self.is_option_set(self.view.ir_options['web_m2x_options.create']);
                var show_create = (!self.options && (m2x_create_undef || m2x_create)) || (self.options && (quick_create || (quick_create_undef && (m2x_create_undef || m2x_create))));
                if (show_create){
                    if (search_val.length > 0 &&
                        !_.include(raw_result, search_val)) {

                        values.push({
                            label: _.str.sprintf(
                                _t('Create "<strong>%s</strong>"'),
                                $('<span />').text(search_val).html()),
                            action: function () {
                                self._quick_create(search_val);
                            },
                            classname: 'oe_m2o_dropdown_option'
                        });
                    }
                }

                // create...
                var create_edit = self.is_option_set(self.options.create) || self.is_option_set(self.options.create_edit),
                    create_edit_undef = _.isUndefined(self.options.create) && _.isUndefined(self.options.create_edit),
                    m2x_create_edit_undef = _.isUndefined(self.view.ir_options['web_m2x_options.create_edit']),
                    m2x_create_edit = self.is_option_set(self.view.ir_options['web_m2x_options.create_edit']);
                var show_create_edit = (!self.options && (m2x_create_edit_undef || m2x_create_edit)) || (self.options && (create_edit || (create_edit_undef && (m2x_create_edit_undef || m2x_create_edit))));
                if (show_create_edit){
                    values.push({
                        label: _t("Create and Edit..."),
                        action: function () {
                            self._search_create_popup(
                                "form", undefined,
                                self._create_context(search_val));
                        },
                        classname: 'oe_m2o_dropdown_option'
                    });
                }
                // Check if colors specified to wait for RPC
                if (!(self.field_color && self.colors)){
                    def.resolve(values);
                }
            });

            return def;
        },

        update_mru_list: function(){
            var self = this,
                mru_option = 'web_m2x_options_mru';
            var key = self.compute_mru_key();
            // check if the localstorage has some items for the current model
            if (localStorage.getItem(mru_option)) {
                var restore_mru_list = JSON.parse(localStorage.getItem(mru_option));
                if (restore_mru_list[key]) {
                    var queue = restore_mru_list[key];
                    // if the element doesn't exist in the stack
                    if (queue.indexOf(self.get_value(true)) < 0 && self.get_value(true)){
                        if (queue.length < 5) {
                            // add the new element at the beginning
                            queue.unshift(self.get_value(true));
                        }else {
                            // remove the last element
                            queue.pop();
                            // add the new element at the beginning
                            queue.unshift(self.get_value(true));
                        }
                        restore_mru_list[key] = queue;
                    }else{
                        // if the element already exist in the stack
                        if (queue.indexOf(self.get_value(true)) >= 0 && self.get_value(true)){
                            var index = queue.indexOf(self.get_value(true));
                            // remove the element from the list
                            queue.splice(index, 1);
                            // and put it back at the beginning
                            queue.unshift(self.get_value(true));
                        }
                    }
                }else{
                    // if the element is the first one
                    if (self.get_value(true)){
                        restore_mru_list[key] = [self.get_value(true)];
                    }
                }
                localStorage.setItem(mru_option, JSON.stringify(restore_mru_list));
            }else {
                // first time to create an entry in the localstorage
                if (self.get_value(true)){
                    var values = {}
                    values[key] = [self.get_value(true)]
                    localStorage.setItem(mru_option, JSON.stringify(values));
                }
            }
        },

        commit_value: function() {
            var self = this;
            // if the field value has changed and has favorites option
            if (self._dirty_flag){
                var can_search_mru = (self.options && self.is_option_set(self.options.search_mru)),
                    search_mru_undef = _.isUndefined(self.options.search_mru),
                    search_mru = self.is_option_set(self.view.ir_options['web_m2x_options.search_mru']);

                if(can_search_mru || (search_mru_undef && search_mru)){
                    self.update_mru_list();
                }
            }
        }
    });

    form_relational.FieldMany2ManyTags.include({
        events: {
            'click .o_delete': function(e) {
                this.remove_id($(e.target).parent().data('id'));
            },
            'click .badge': 'open_badge',
            'mousedown .o_colorpicker span': 'update_color',
            'focusout .o_colorpicker': 'close_color_picker',
        },
        show_error_displayer: function () {
            if ((typeof this.options.m2o_dialog === 'undefined' && this.can_create) ||
                this.options.m2o_dialog) {
                new M2ODialog(this).open();
            }
        },

        start: function() {
            this._super.apply(this, arguments);
            return this.get_options();
        },

        get_options: function() {
            var self = this;
            if (_.isUndefined(this.view.ir_options_loaded)) {
                this.view.ir_options_loaded = $.Deferred();
                this.view.ir_options = {};
                (new Model("ir.config_parameter"))
                        .query(["key", "value"]).filter([['key', 'in', OPTIONS]])
                        .all().then(function(records) {
                        _(records).each(function(record) {
                    self.view.ir_options[record.key] = record.value;
                    });
                self.view.ir_options_loaded.resolve();
            });
            }
            return this.view.ir_options_loaded;
        },

        is_option_set: function(option) {
            if (_.isUndefined(option)) {
                return false
            }
            var is_string = typeof option === 'string'
            var is_bool = typeof option === 'boolean'
            if (is_string) {
                return option === 'true' || option === 'True'
            } else if (is_bool) {
                return option
            }
            return false
        },

        /**
        * Call this method to search using a string.
        */

        get_search_result: function(search_val) {
            var self = this;

            // add options limit used to change number of selections record
            // returned.

            if (!_.isUndefined(this.view.ir_options['web_m2x_options.limit'])) {
                this.limit = parseInt(this.view.ir_options['web_m2x_options.limit']);
            }

            if (typeof this.options.limit === 'number') {
                this.limit = this.options.limit;
            }

            var dataset = new data.DataSet(this, this.field.relation, self.build_context());
            var blacklist = this.get_search_blacklist();
            this.last_query = search_val;

            return this.orderer.add(dataset.name_search(
                    search_val, new data.CompoundDomain(self.build_domain(), [["id", "not in", blacklist]]),
                    'ilike', this.limit + 1, self.build_context())).then(function(data) {
                self.last_search = data;
                // possible selections for the m2o
                var values = _.map(data, function(x) {
                    x[1] = x[1].split("\n")[0];
                    return {
                        label: _.str.escapeHTML(x[1]),
                        value: x[1],
                        name: x[1],
                        id: x[0],
                    };
                });

                // search more... if more results that max
                if (values.length > self.limit) {
                    values = values.slice(0, self.limit);
                    values.push({
                        label: _t("Search More..."),
                        action: function() {

                            // limit = 80 for improving performance, similar
                            // to Odoo implementation here:
                            // https://github.com/odoo/odoo/commit/8c3cdce539d87775b59b3f2d5ceb433f995821bf
                            dataset.name_search(search_val, self.build_domain(), 'ilike', 80).done(function(data) {
                                self._search_create_popup("search", data);
                            });
                        },
                        classname: 'oe_m2o_dropdown_option'
                    });
                }
                // quick create
                var quick_create = !(
                        self.options && (self.is_option_set(self.options.create) ||
                            self.is_option_set(self.options.quick_create))
                );
                var m2x_create_undef = _.isUndefined(self.view.ir_options['web_m2x_options.create'])
                var m2x_create = self.is_option_set(self.view.ir_options['web_m2x_options.create']);

                if (quick_create && (m2x_create_undef || m2x_create)) {

                    var raw_result = _(data.result).map(function(x) {return x[1];});
                    if (search_val.length > 0 && !_.include(raw_result, search_val)) {
                        values.push({
                            label: _.str.sprintf(_t('Create "<strong>%s</strong>"'),
                                $('<span />').text(search_val).html()),
                            action: function() {
                                self._quick_create(search_val);
                            },
                            classname: 'oe_m2o_dropdown_option'
                        });
                    }
                }

                // create...
                var create_edit = (
                    self.options && (self.is_option_set(self.options.create) ||
                        self.is_option_set(self.options.create_edit))
                )
                var m2x_create_edit_undef = _.isUndefined(self.view.ir_options['web_m2x_options.create_edit'])
                var m2x_create_edit = self.is_option_set(self.view.ir_options['web_m2x_options.create_edit'])

                if (create_edit && (m2x_create_edit_undef || m2x_create_edit)) {

                    values.push({
                        label: _t("Create and Edit..."),
                        action: function() {
                            self._search_create_popup("form", undefined, self._create_context(search_val));
                        },
                        classname: 'oe_m2o_dropdown_option'
                    });
                }

                return values;
            })
        },

        open_badge: function(ev){
            var self = this;
            var open = (self.options && self.is_option_set(self.options.open));
            if(open){
                self.mutex.exec(function(){
                    var id = parseInt($(ev.handleObj.selector).attr('data-id'));
                    self.do_action({
                        type: 'ir.actions.act_window',
                        res_model: self.field.relation,
                        views: [[false, 'form']],
                        res_id: id,
                        target: "new"
                    });
                }.bind(this));
            }else{
                self.open_color_picker(ev);
            }
        },

     });
});
