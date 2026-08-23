<? echo $html->css($profileCSS); ?>

<? if (isset($invalidName)): ?>
<H3>No miner by the name <? echo $invalidName; ?></H3>
<? else: ?>

<!--Content Column-->	
	<!-- Profile Content -->
	<div class="profile_wrapper">
		<!-- User Avatar -->
		<div class="profile_avatar">
			<? echo $html->image($profileImage); ?>
		</div>
		<!-- User Information -->
		<div class="profile_userInfo">

			<!-- User Line - contains username and user online status -->
			<div class="profile_userLine">
				<span class="profile_username">
					<!-- User username -->
					<? echo $owner['Miner']['name']; ?>
					<? if ($isAdministrator) echo $html->link('admin', '/admins/view_miner/'.$owner['Miner']['name']); ?>
				</span>		

				<? if ($online): ?>
				<span class="profile_userOnline">
					<!-- User online status -->
					(online)
				</span>
				<? endif; ?>

			</div>
			<!-- Profession line - contains user profession -->
			<div class="profile_professionLine">
				<span class="profile_profession">
					<!-- User profession -->
					<? echo $profession; ?> from <? echo $owner['City']['name']; ?>
				</span>
			</div>
			<!-- Description line - contains user description -->

			<div class="profile_descriptionLine" style="display:none">
				<span class="profile_userDescription">
					<!-- User description -->
					<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. In imperdiet rhoncus vehicula. Curabitur bibendum gravida est eu accumsan. Sed suscipit, erat a sodales ultricies, velit leo eleifend enim, in tincidunt nisi odio eu lectus. Duis at tortor lectus. In sed nunc neque. Fusce luctus turpis in eros vestibulum quis fringilla libero rhoncus. Vivamus sit amet urna sit amet sem elementum ultricies. Phasellus sapien sapien, rhoncus eu porta nec, rhoncus molestie lorem. Pellentesque in sem sed sem mollis scelerisque. Cras elementum arcu lacus.</p>
				</span>
			</div>
			<div class="profile_optionline">				
					<!-- Send Message -->
					<? echo $html->link($html->image('icons/icon_message.png', array('style' => 'border-style:none')).' Send Message', '/messages/chat/'.$owner['Miner']['name'], array('escape' => false)); ?>

			</div>
			<div class="profile_optionline">				
					<!-- Listing/Bid -->
					<? echo $html->link($html->image('icons/icon_listing.png', array('style' => 'border-style:none')).' Listings and Bids', '/miners/market/'.$owner['Miner']['name'], array('escape' => false)); ?>
			</div>
			<? if ($isOwner): ?>
			<div class="profile_optionline">				
					<!-- Profile Image -->
					<?
					echo $html->link($html->image('icons/icon_profileimage.png', array('style' => 'border-style:none')).' Change Profile Image', '/miners/edit_avatar', array(
						'class' => 'lightview', 
						'rel' => 'iframe', 
						'title' => ' :: :: width: 950, height: 320',
						'escape' => false
						));
					?>
					<!-- <a href="/miners/edit_avatar"><img src="images/icon_profileimage.png" border=0 /> Change Profile Image</a> -->

			</div>
			<? endif; ?>
			<br />
		</div>
	
		<!-- Clear the floats so we can float on the next line -->
		<div style="clear:left;"></div>
		
<BR>
<div id="MeldList">
<? 
echo $itemList->MeldTable($melds, $meldCount, $isOwner, array('url' => '/miners/js_all_melds/'.$owner['Miner']['name'], 'div' => 'MeldList'));
?>
</div>

<div class="localnav">
<?
$anchorAtts = array();
if (!isset($mineTypeId))
	$anchorAtts = array('class' => 'currentpage');
?>
<span class="bodytext">Filter by mine:</span> <? echo $html->link("All", '/miners/show_items/'.$owner['Miner']['name'], $anchorAtts); ?> 
<?
foreach ($mineTypes as $type) {
	$anchorAtts = array();
	if (isset($mineTypeId) and $mineTypeId == $type['MineType']['id'])
		$anchorAtts = array('class' => 'currentpage');
	echo $html->link($type['MineType']['name'], '/miners/show_items/'.$owner['Miner']['name'].'/'.$type['MineType']['id'], $anchorAtts); 
	echo " ";
	}
?>
<BR>
</div><!--End localnav-->

<? $localThingCount = $paginator->counter(array('format' => '%count% ')); ?>
<table><tr>
<td valign=bottom><h2><? echo $localThingCount; ?> Thing<? if ($localThingCount != 1) echo 's'; ?> in <?echo $currentCityName;?>: </h2></td>
<td valign=bottom>(<? echo $totalThingCount; ?> total)</span></td>
</tr></table>
<? echo $itemList->itemTable($items, $rarityColors, $isAdministrator);?>

<?
$paginator->options( array('url' => $this->passedArgs) );
echo $paginator->prev('<< Previous ', null, null);//, array('class' => 'disabled'));
echo $paginator->next(' Next >>', null, null);//, array('class' => 'disabled'));
?><br><?
echo $paginator->counter(array(
	'format' => 'Page %page% of %pages%'
	));
?>

<? endif; // ($noSuchMiner) ?>

</div> <!-- profile wrapper -->


<SCRIPT type="text/javascript">
document.observe('lightview:hidden', function() {
	//location.reload(true);
});
</SCRIPT>