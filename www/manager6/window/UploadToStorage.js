Ext.define('PVE.window.UploadToStorage', {
    extend: 'Ext.window.Window',
    alias: 'widget.pveStorageUpload',
    mixins: ['Proxmox.Mixin.CBind'],

    resizable: false,
    modal: true,

    title: gettext('Upload'),

    acceptedExtensions: {
	iso: ['.img', '.iso'],
	vztmpl: ['.tar.gz', '.tar.xz'],
    },

    cbindData: function(initialConfig) {
	const me = this;
	const ext = me.acceptedExtensions[me.content] || [];

	me.url = `/nodes/${me.nodename}/storage/${me.storage}/upload`;

	return {
	    extensions: ext.join(', '),
	};
    },

    viewModel: {
	data: {
	    size: '-',
	    mimetype: '-',
	    filename: '',
	},
    },

    controller: {
	submit: function(button) {
	    const view = this.getView();
	    const form = this.lookup('formPanel').getForm();
	    const abortBtn = this.lookup('abortBtn');
	    const pbar = this.lookup('progressBar');

	    const updateProgress = function(per, bytes) {
		let text = (per * 100).toFixed(2) + '%';
		if (bytes) {
		    text += " (" + Proxmox.Utils.format_size(bytes) + ')';
		}
		pbar.updateProgress(per, text);
	    };

	    const fd = new FormData();

	    button.setDisabled(true);
	    abortBtn.setDisabled(false);

	    fd.append("content", view.content);

	    const fileField = form.findField('file');
	    const file = fileField.fileInputEl.dom.files[0];
	    fileField.setDisabled(true);

	    const filenameField = form.findField('filename');
	    const filename = filenameField.getValue();
	    filenameField.setDisabled(true);

	    fd.append("filename", file, filename);

	    pbar.setVisible(true);
	    updateProgress(0);

	    const xhr = new XMLHttpRequest();
	    view.xhr = xhr;

	    xhr.addEventListener("load", function(e) {
		if (xhr.status === 200) {
		    view.close();
		    return;
		}
		const err = Ext.htmlEncode(xhr.statusText);
		let msg = `${gettext('Error')} ${xhr.status.toString()}: ${err}`;
		if (xhr.responseText !== "") {
		    const result = Ext.decode(xhr.responseText);
		    result.message = msg;
		    msg = Proxmox.Utils.extractRequestError(result, true);
		}
		Ext.Msg.alert(gettext('Error'), msg, btn => view.close());
	    }, false);

	    xhr.addEventListener("error", function(e) {
		const err = e.target.status.toString();
		const msg = `Error '${err}' occurred while receiving the document.`;
		Ext.Msg.alert(gettext('Error'), msg, btn => view.close());
	    });

	    xhr.upload.addEventListener("progress", function(evt) {
		if (evt.lengthComputable) {
		    const percentComplete = evt.loaded / evt.total;
		    updateProgress(percentComplete, evt.loaded);
		}
	    }, false);

	    xhr.open("POST", `/api2/json${view.url}`, true);
	    xhr.send(fd);
	},

	validitychange: function(f, valid) {
	    const submitBtn = this.lookup('submitBtn');
	    submitBtn.setDisabled(!valid);
	},

	fileChange: function(input) {
	    const vm = this.getViewModel();
	    const name = input.value.replace(/^.*(\/|\\)/, '');
	    const fileInput = input.fileInputEl.dom;
	    vm.set('filename', name);
	    vm.set('size', (fileInput.files[0] && Proxmox.Utils.format_size(fileInput.files[0].size)) || '-');
	    vm.set('mimetype', (fileInput.files[0] && fileInput.files[0].type) || '-');
	},
    },

    items: [
	{
	    xtype: 'form',
	    reference: 'formPanel',
	    method: 'POST',
	    waitMsgTarget: true,
	    bodyPadding: 10,
	    border: false,
	    width: 400,
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%',
            },
	    items: [
		{
		    xtype: 'filefield',
		    name: 'file',
		    buttonText: gettext('Select File'),
		    allowBlank: false,
		    fieldLabel: gettext('File'),
		    cbind: {
			accept: '{extensions}',
		    },
		    listeners: {
			change: 'fileChange',
		    },
		},
		{
		    xtype: 'textfield',
		    name: 'filename',
		    allowBlank: false,
		    fieldLabel: gettext('File name'),
		    bind: {
			value: '{filename}',
		    },
		},
		{
		    xtype: 'displayfield',
		    name: 'size',
		    fieldLabel: gettext('File size'),
		    bind: {
			value: '{size}',
		    },
		},
		{
		    xtype: 'displayfield',
		    name: 'mimetype',
		    fieldLabel: gettext('MIME type'),
		    bind: {
			value: '{mimetype}',
		    },
		},
		{
		    xtype: 'progressbar',
		    text: 'Ready',
		    hidden: true,
		    reference: 'progressBar',
		},
		{
		    xtype: 'hiddenfield',
		    name: 'content',
		    cbind: {
			value: '{content}',
		    },
		},
	    ],
	   listeners: {
		validitychange: 'validitychange',
	   },
	},
    ],

    buttons: [
	{
	    xtype: 'button',
	    text: gettext('Abort'),
	    reference: 'abortBtn',
	    disabled: true,
	    handler: function() {
		const me = this;
		me.up('pveStorageUpload').close();
	    },
	},
	{
	    text: gettext('Upload'),
	    reference: 'submitBtn',
	    disabled: true,
	    handler: 'submit',
	},
    ],

    listeners: {
	close: function() {
	    const me = this;
	    if (me.xhr) {
		me.xhr.abort();
		delete me.xhr;
	    }
	},
    },

    initComponent: function() {
        const me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}
	if (!me.storage) {
	    throw "no storage ID specified";
	}
	if (!me.acceptedExtensions[me.content]) {
	    throw "content type not supported";
	}

        me.callParent();
    },
});
