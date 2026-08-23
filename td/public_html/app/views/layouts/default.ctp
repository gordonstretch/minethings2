<? include 'head.inc' ?>

<!--Body-->
<body>

	<? include 'header.inc'; ?>
	<? include 'horiz_menu.inc'; ?>

	<div id="divwrapper">

	<? include 'vert_menu.inc'; ?>


	<div id="LoadingDiv" style="display:none; position:absolute; padding-left:400px; padding-top:300px; z-index:500">
	<? echo $html->image('loading.gif'); ?>
	</div>

	<!--Content Column-->
	<div id="content">
	<? echo $content_for_layout; ?>
	</div>
	<!--End Content Column-->


	</div> <!-- End Div Wrapper -->
		
	<footer>
		    <p> &copy; 4024 Minethings.com </p>
	</footer>

	<?php echo $this->element('sql_dump'); ?>

	</div> <!-- End Wrapper -->

	<? if ($flagConverted): ?>
		<!-- Google Code for Find 2 Conversion Page -->
		<script type="text/javascript">
		/* <![CDATA[ */
		var google_conversion_id = 1032221859;
		var google_conversion_language = "en";
		var google_conversion_format = "3";
		var google_conversion_color = "5e5a57";
		var google_conversion_label = "j--3CIHKpwEQo-mZ7AM";
		var google_remarketing_only = false;
		/* ]]> */
		</script>
		<script type="text/javascript" src="//www.googleadservices.com/pagead/conversion.js">
		</script>
		<noscript>
		<div style="display:inline;">
		<img height="1" width="1" style="border-style:none;" alt="" src="//www.googleadservices.com/pagead/conversion/1032221859/?label=j--3CIHKpwEQo-mZ7AM&amp;guid=ON&amp;script=0"/>
		</div>
		</noscript>

		<!-- Facebook Conversion Code for conversions -->
		<script>(function() {
		var _fbq = window._fbq || (window._fbq = []);
		if (!_fbq.loaded) {
		var fbds = document.createElement('script');
		fbds.async = true;
		fbds.src = '//connect.facebook.net/en_US/fbds.js';
		var s = document.getElementsByTagName('script')[0];
		s.parentNode.insertBefore(fbds, s);
		_fbq.loaded = true;
		}
		})();
		window._fbq = window._fbq || [];
		window._fbq.push(['track', '6017241394321', {'value':'2.66','currency':'USD'}]);
		</script>
		<noscript><img height="1" width="1" alt="" style="display:none" src="https://www.facebook.com/tr?ev=6017241394321&amp;cd[value]=2.66&amp;cd[currency]=USD&amp;noscript=1" /></noscript>

	<? endif; ?>

	<? if (!$converted): ?>
		<!-- Google Code for remarketing to an unconverted miner -->
		<script type="text/javascript">
		/* <![CDATA[ */
		var google_conversion_id = 1032221859;
		var google_custom_params = window.google_tag_params;
		var google_remarketing_only = true;
		/* ]]> */
		</script>
		<script type="text/javascript" src="//www.googleadservices.com/pagead/conversion.js">
		</script>
		<noscript>
		<div style="display:inline;">
		<img height="1" width="1" style="border-style:none;" alt="" src="//googleads.g.doubleclick.net/pagead/viewthroughconversion/1032221859/?value=0&amp;guid=ON&amp;script=0"/>
		</div>
		</noscript>
	
	<? endif; ?>


	<?
	echo $ajax->remoteTimer(array(
		'url' => '/php/updateUI.php?minerId='.$minerId,
		'update' => array('FindingsDiv', 'MessagesDiv'),
		'frequency' => 300,
		));
	?>

	<? if ($debug): ?>
	<SCRIPT>
	$$('body')[0].setStyle({background: '#FFF'});
	</script>
	<? endif; ?>

</body>
</html>
