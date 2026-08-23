<? echo $html->css($profileCSS); ?>

<!-- Profile Content -->
<? echo $html->link('Show Full Profile', '/miners/profile/'.$owner['name'], array('style' => 'margin-left:30px')); ?>

<div class="profile_wrapper">

	<? include 'inventory.inc'; ?>

</div> <!-- profile wrapper -->
<div class="clear"></div>
