<? 
if (isset($javascript))
	echo $javascript->link('raphael2.1.2.js'); 
echo $html->css('machines.css');
?>

<div id="fullcenter">
<? include 'board.inc'; ?>
</div>


<script type="text/javascript">
	Event.observe(window, 'load', drawboard);
</script>
