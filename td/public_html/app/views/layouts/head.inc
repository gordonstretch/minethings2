<?php
header("Cache-Control: no-cache, must-revalidate"); // HTTP/1.1
header("Expires: Sat, 26 Jul 1997 05:00:00 GMT"); // Date in the past
header("Connection: keep-alive");
?>

<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">

<head>

	<!--Favicon-->
	<? echo $html->meta('icon', '/app/img/favicon.ico', array('rel' => 'shortcut icon')); ?>

	<meta charset="UTF-8" >
	<title><? echo $title_for_layout; ?></title>
		
	<!--Meta tags-->
	<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1" />
	<meta name="Description" content="Minethings - Collect valuable things throughout the day in real-time, even while logged out.  Trade with others locally or in foreign cities.  Pillage other traders en route or hunt pirates for bounty.  Free to play, no subscription." />
	<meta name="description" content="Minethings - Collect valuable things throughout the day in real-time, even while logged out.  Trade with others locally or in foreign cities.  Pillage other traders en route or hunt pirates for bounty.  Free to play, no subscription." />
	<link rel="image_src" href="www.minethings.com/share/MTLogo.gif"/>
	<meta name="Keywords" content="free game browser browser-game rpg mmorpg mine things mmo" />

	<!--Links to stylesheets/js-->
	<link rel="stylesheet" href="/css/<? echo $stylesCSS; ?>.css" />
	<link rel="stylesheet" href="/css/lightview.css" />
	<script src="/js/prototype1.6.1/prototype.js"></script>
	<script src="/js/scriptaculous1.8.3/scriptaculous.js"></script>
	<script src="/js/lightview2.5.2.1/js/lightview.js"></script>
	<script src="/js/<? echo $menuJS; ?>.js"></script>


	<!--Google analytics-->
	<script>
	  var _gaq = _gaq || [];
	  _gaq.push(['_setAccount', 'UA-19890429-1']);
	  _gaq.push(['_setDomainName', '.minethings.com']);
	  _gaq.push(['_trackPageview']);

	  (function() {
		var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
		ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
		var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
	  })();
	</script>


</head>
