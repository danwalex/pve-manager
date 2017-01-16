package PVE::HTTPServer;

use strict;
use warnings;

use PVE::SafeSyslog;
use PVE::INotify;
use PVE::Tools;
use PVE::APIServer::AnyEvent;

use PVE::RPCEnvironment;
use PVE::AccessControl;
use PVE::Cluster;

use Data::Dumper;

use base('PVE::APIServer::AnyEvent');

use HTTP::Status qw(:constants);

sub new {
    my ($this, %args) = @_;

    my $class = ref($this) || $this;

    my $self = $class->SUPER::new(%args);
    
    $self->{rpcenv} = PVE::RPCEnvironment->init(
	$self->{trusted_env} ? 'priv' : 'pub', atfork =>  sub { $self-> atfork_handler() });

    return $self;
}

sub verify_spice_connect_url {
    my ($self, $connect_str) = @_;

    my ($vmid, $node, $port) = PVE::AccessControl::verify_spice_connect_url($connect_str);

    return ($vmid, $node, $port);
}

sub generate_csrf_prevention_token {
    my ($username) = @_;

    return PVE::AccessControl::assemble_csrf_prevention_token($username);
}

sub auth_handler {
    my ($self, $method, $rel_uri, $ticket, $token) = @_;

    my $rpcenv = $self->{rpcenv};

    my $require_auth = 1;

    # explicitly allow some calls without auth
    if (($rel_uri eq '/access/domains' && $method eq 'GET') ||
	($rel_uri eq '/access/ticket' && ($method eq 'GET' || $method eq 'POST'))) {
	$require_auth = 0;
    }

    my ($username, $age);

    my $isUpload = 0;

    if ($require_auth) {

	die "No ticket\n" if !$ticket;

	($username, $age) = PVE::AccessControl::verify_ticket($ticket);

	$rpcenv->set_user($username);

	if ($method eq 'POST' && $rel_uri =~ m|^/nodes/([^/]+)/storage/([^/]+)/upload$|) {
	    my ($node, $storeid) = ($1, $2);
	    # we disable CSRF checks if $isUpload is set,
	    # to improve security we check user upload permission here
	    my $perm = { check => ['perm', "/storage/$storeid", ['Datastore.AllocateTemplate']] };
	    $rpcenv->check_api2_permissions($perm, $username, {});
	    $isUpload = 1;
	}

	# we skip CSRF check for file upload, because it is
	# difficult to pass CSRF HTTP headers with native html forms,
	# and it should not be necessary at all.
	my $euid = $>;
	PVE::AccessControl::verify_csrf_prevention_token($username, $token)
	    if !$isUpload && ($euid != 0) && ($method ne 'GET');
    }

    return {
	ticket => $ticket,
	token => $token,
	userid => $username,
	age => $age,
	isUpload => $isUpload,
	cookie_name => $self->{cookie_name},
    };
}

my $exc_to_res = sub {
    my ($info, $err, $status) = @_;

    $status = $status || HTTP_INTERNAL_SERVER_ERROR;

    my $resp = { info => $info };
    if (ref($err) eq "PVE::Exception") {
	$resp->{status} = $err->{code} || $status;
	$resp->{errors} = $err->{errors} if $err->{errors};
	$resp->{message} = $err->{msg};
    } else {
	$resp->{status} = $status;
	$resp->{message} = $err;
    }

    return $resp;
};

sub rest_handler {
    my ($self, $clientip, $method, $rel_uri, $auth, $params) = @_;

    my $rpcenv = $self->{rpcenv};

    my $base_handler_class = $self->{base_handler_class};

    die "no base handler - internal error" if !$base_handler_class;

    my $uri_param = {};
    my ($handler, $info) = $base_handler_class->find_handler($method, $rel_uri, $uri_param);
    if (!$handler || !$info) {
	return {
	    status => HTTP_NOT_IMPLEMENTED,
	    message => "Method '$method $rel_uri' not implemented",
	};
    }

    foreach my $p (keys %{$params}) {
	if (defined($uri_param->{$p})) {
	    return {
		status => HTTP_BAD_REQUEST,
		message => "Parameter verification failed - duplicate parameter '$p'",
	    };
	}
	$uri_param->{$p} = $params->{$p};
    }

    # check access permissions
    eval { $rpcenv->check_api2_permissions($info->{permissions}, $auth->{userid}, $uri_param); };
    if (my $err = $@) {
	return &$exc_to_res($info, $err, HTTP_FORBIDDEN);
    }

    if ($info->{proxyto}) {
	my $remip;
	my $node;
	eval {
	    my $pn = $info->{proxyto};
	    $node = $uri_param->{$pn};
	    die "proxy parameter '$pn' does not exists" if !$node;

	    if ($node ne 'localhost' && $node ne PVE::INotify::nodename()) {
		die "unable to proxy file uploads" if $auth->{isUpload};
		$remip = $self->remote_node_ip($node);
	    }
	};
	if (my $err = $@) {
	    return &$exc_to_res($info, $err);
	}
	if ($remip) {
	    return { proxy => $remip, proxynode => $node, proxy_params => $params };
	}
    }

    my $euid = $>;
    if ($info->{protected} && ($euid != 0)) {
	return { proxy => 'localhost' , proxy_params => $params }
    }

    my $resp = {
	info => $info, # useful to format output
	status => HTTP_OK,
    };

    eval {
	$resp->{data} = $handler->handle($info, $uri_param);

	if (my $count = $rpcenv->get_result_attrib('total')) {
	    $resp->{total} = $count;
	}
	if (my $diff = $rpcenv->get_result_attrib('changes')) {
	    $resp->{changes} = $diff;
	}
    };
    if (my $err = $@) {
	return &$exc_to_res($info, $err);
    }

    return $resp;
}

sub check_cert_fingerprint {
    my ($self, $cert) = @_;

    return PVE::Cluster::check_cert_fingerprint($cert);
}

sub initialize_cert_cache {
    my ($self, $node) = @_;

    PVE::Cluster::initialize_cert_cache($node);
}

sub remote_node_ip {
    my ($self, $node) = @_;

    my $remip = PVE::Cluster::remote_node_ip($node);

    die "unable to get remote IP address for node '$node'\n" if !$remip;

    return $remip;
}

1;
