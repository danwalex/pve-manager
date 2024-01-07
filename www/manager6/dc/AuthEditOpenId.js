Ext.define('PVE.panel.OpenIDInputPanel', {
    extend: 'PVE.panel.AuthBase',
    xtype: 'pveAuthOpenIDPanel',
    mixins: ['Proxmox.Mixin.CBind'],

    onGetValues: function(values) {
	let me = this;

	if (!values.verify) {
	    if (!me.isCreate) {
		Proxmox.Utils.assemble_field_data(values, { 'delete': 'verify' });
	    }
	    delete values.verify;
	}

	return me.callParent([values]);
    },

    columnT: [
	{
	    xtype: 'textfield',
	    name: 'issuer-url',
	    fieldLabel: gettext('Issuer URL'),
	    allowBlank: false,
	},
    ],

    column1: [
	{
	    xtype: 'proxmoxtextfield',
	    fieldLabel: gettext('Client ID'),
	    name: 'client-id',
	    allowBlank: false,
	},
	{
	    xtype: 'proxmoxtextfield',
	    fieldLabel: gettext('Client Key'),
	    cbind: {
		deleteEmpty: '{!isCreate}',
	    },
	    name: 'client-key',
	},
    ],

    column2: [
	
	{
	    xtype: 'pmxDisplayEditField',
	    name: 'username-claim',
	    fieldLabel: gettext('Username Claim'),
	    editConfig: {
		xtype: 'proxmoxKVComboBox',
		editable: true,
		comboItems: [
		    ['__default__', Proxmox.Utils.defaultText],
		    ['subject', 'subject'],
		    ['username', 'username'],
		    ['email', 'email'],
		],
	    },
	    cbind: {
		value: get => get('isCreate') ? '__default__' : Proxmox.Utils.defaultText,
		deleteEmpty: '{!isCreate}',
		editable: '{isCreate}',
	    },
	},
	{
	    xtype: 'proxmoxtextfield',
	    name: 'scopes',
	    fieldLabel: gettext('Scopes'),
	    emptyText: `${Proxmox.Utils.defaultText} (email profile)`,
	    submitEmpty: false,
	    cbind: {
		deleteEmpty: '{!isCreate}',
	    },
	},
	
	{
	    xtype: 'proxmoxKVComboBox',
	    name: 'prompt',
	    fieldLabel: gettext('Prompt'),
	    editable: true,
	    emptyText: gettext('Auth-Provider Default'),
	    comboItems: [
		['__default__', gettext('Auth-Provider Default')],
		['none', 'none'],
		['login', 'login'],
		['consent', 'consent'],
		['select_account', 'select_account'],
	    ],
	    cbind: {
		deleteEmpty: '{!isCreate}',
	    },
	},
    ],

	columnB: [
		{
			xtype: 'fieldset',
			title: gettext('Options for OpenID Connect'),
			items: [
		// sync option with filter group option for openid connect, so we can use the same
				
				{
					xtype: 'proxmoxtextfield',
					fieldLabel: gettext('Groups Filter'),
					name: 'remove-vanished-acl',
					boxLabel: gettext('TEST'),
					deleteEmpty: true,
					submitEmpty: false,
					cbind: {
						deleteEmpty: '{!isCreate}',
					},
				},
				{
					xtype: 'proxmoxcheckbox',
					fieldLabel: gettext('Autocreate Users'),
					name: 'autocreate',
					boxLabel: gettext('Create User if not exists Automatically'),
				},
				{
					xtype: 'proxmoxcheckbox',
					fieldLabel: gettext('Auto Sync Groups'),
					name: 'autocreate-groups',
					boxLabel: gettext('Create and Sync Groups Automatically'),
				},
				
				],
				
			
		},	
		],
    advancedColumnB: [
	{
	    xtype: 'proxmoxtextfield',
	    name: 'acr-values',
	    fieldLabel: gettext('ACR Values'),
	    submitEmpty: false,
	    cbind: {
		deleteEmpty: '{!isCreate}',
	    },
	},
    ],

    initComponent: function() {
	let me = this;

	if (me.type !== 'openid') {
	    throw 'invalid type';
	}

	me.callParent();
    },
});