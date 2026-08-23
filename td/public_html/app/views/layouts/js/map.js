function OpenInParent(destination) {
	opener.open(destination + "?redirect=" + this.changeCityRedirect, '_self');
	close();
}